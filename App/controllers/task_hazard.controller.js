const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const User = db.user;
const Notification = db.notifications;
const SupervisorApproval = db.supervisor_approvals;

/**
 * Helper function to convert likelihood and consequence strings to integers
 * Supports both string values and numeric inputs with proper fallbacks
 */
const convertToInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return 1; // Default value for empty inputs
  }
  
  // Maps for conversion
  const likelihoodMap = {
    'Very Unlikely': 1,
    'Slight Chance': 2,
    'Feasible': 3,
    'Likely': 4,
    'Very Likely': 5
  };
  
  const consequenceMap = {
    'Minor': 1,
    'Significant': 2,
    'Serious': 3,
    'Major': 4,
    'Catastrophic': 5
  };
  
  // If the value is already a number, return it
  if (!isNaN(Number(value))) {
    return Number(value);
  }
  
  // Check if value is in our maps
  if (likelihoodMap[value] !== undefined) {
    return likelihoodMap[value];
  }
  
  if (consequenceMap[value] !== undefined) {
    return consequenceMap[value];
  }

  // If we get here, we couldn't convert properly
  return 1; // Default fallback
};

/**
 * Helper function to standardize error responses
 */
const createErrorResponse = (status, message, details = null) => {
  const response = { status: false, message };
  if (details) response.details = details;
  return response;
};

/**
 * Helper function to standardize success responses
 */
const createSuccessResponse = (message, data = null) => {
  const response = { status: true, message };
  if (data) response.data = data;
  return response;
};

/**
 * Helper function to get user's company ID with validation
 */
const getUserCompanyId = (req) => {
  const userCompanyId = req.user?.company?.id;
  if (!userCompanyId) {
    throw new Error("User's company information is missing");
  }
  return userCompanyId;
};

/**
 * Helper function to validate required fields for task hazard creation/update
 */
const validateRequiredFields = (body) => {
  const missingFields = [];
  const requiredFields = [
    { field: 'date', name: 'Date' },
    { field: 'time', name: 'Time' },
    { field: 'scopeOfWork', name: 'Scope of Work' },
    { field: 'trainedWorkforce', name: 'Trained Workforce' },
    { field: 'individual', name: 'Individual' },
    { field: 'supervisor', name: 'Supervisor' },
    { field: 'location', name: 'Location' }
  ];

  requiredFields.forEach(({ field, name }) => {
    if (!body[field]) {
      missingFields.push(name);
    }
  });

  // Check if risks array exists and is not empty for creation
  if (!body.risks || !Array.isArray(body.risks) || body.risks.length === 0) {
    missingFields.push('Risks (at least one risk is required)');
  }

  return missingFields;
};

/**
 * Helper function to parse and validate individual emails
 * Returns array of validated User objects
 */
const parseAndValidateIndividuals = async (individualString, transaction = null) => {
  const individualEmails = individualString.split(',').map(email => email.trim());
  
  const individuals = await Promise.all(
    individualEmails.map(async (email) => {
      const user = await User.findOne({
        where: { email }
      }, transaction ? { transaction } : {});
      
      if (!user) {
        throw new Error(`Individual with email ${email} not found`);
      }
      return user;
    })
  );

  return individuals;
};

/**
 * Helper function to find and validate supervisor
 */
const findAndValidateSupervisor = async (supervisorEmail, transaction = null) => {
  const supervisor = await User.findOne({
    where: { email: supervisorEmail }
  }, transaction ? { transaction } : {});

  if (!supervisor) {
    throw new Error("Supervisor not found");
  }

  return supervisor;
};

/**
 * Helper function to process and validate risk data
 */
const processRisks = (risks) => {
  return risks.map((risk) => ({
    riskDescription: risk.riskDescription,
    riskType: risk.riskType,
    asIsLikelihood: convertToInteger(risk.asIsLikelihood),
    asIsConsequence: convertToInteger(risk.asIsConsequence),
    mitigatingAction: risk.mitigatingAction,
    mitigatingActionType: risk.mitigatingActionType,
    mitigatedLikelihood: convertToInteger(risk.mitigatedLikelihood),
    mitigatedConsequence: convertToInteger(risk.mitigatedConsequence),
    requiresSupervisorSignature: risk.requiresSupervisorSignature || false
  }));
};

/**
 * Helper function to determine task hazard status based on risks
 */
const determineTaskHazardStatus = (risks, requestedStatus = 'Pending') => {
  // If any risk requires supervisor signature, status must be 'Pending'
  const requiresSignature = risks.some(risk => risk.requiresSupervisorSignature);
  return requiresSignature ? 'Pending' : requestedStatus;
};

/**
 * Helper function to get approval information for a task hazard
 * Only fetches when needed to avoid unnecessary queries
 */
const getApprovalInfo = async (taskHazardId) => {
  try {
    // Get current active approval (not invalidated)
    const currentApproval = await SupervisorApproval.findOne({
      where: {
        taskHazardId,
        isInvalidated: false
      },
      include: [
        { model: User, as: 'supervisor', attributes: ['id', 'email', 'name', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Get latest approved approval
    const latestApproval = await SupervisorApproval.findOne({
      where: {
        taskHazardId,
        status: 'approved',
        isInvalidated: false
      },
      include: [
        { model: User, as: 'supervisor', attributes: ['id', 'email', 'name', 'role'] }
      ],
      order: [['processedAt', 'DESC']]
    });

    return {
      hasCurrentApproval: !!currentApproval,
      currentApprovalStatus: currentApproval?.status || null,
      currentApprovalPending: currentApproval?.status === 'pending',
      hasLatestApproval: !!latestApproval,
      lastApprovedAt: latestApproval?.processedAt || null,
      lastApprovedBy: latestApproval?.supervisor ? {
        id: latestApproval.supervisor.id,
        email: latestApproval.supervisor.email,
        name: latestApproval.supervisor.name
      } : null
    };
  } catch (error) {
    console.error('Error fetching approval info:', error);
    return {
      hasCurrentApproval: false,
      currentApprovalStatus: null,
      currentApprovalPending: false,
      hasLatestApproval: false,
      lastApprovedAt: null,
      lastApprovedBy: null
    };
  }
};

/**
 * Helper function to format task hazard for frontend response
 * Converts junction table associations to comma-separated email string
 */
const formatTaskHazard = (taskHazard) => {
  const formatted = {
    ...taskHazard.get({ plain: true }),
    supervisor: taskHazard.supervisor?.email || '',
  };
  
  // Get all individuals from the many-to-many association via junction table
  if (taskHazard.individuals && taskHazard.individuals.length > 0) {
    formatted.individual = taskHazard.individuals.map(user => user.email).join(', ');
  } else {
    formatted.individual = ''; // No individuals assigned
  }
  
  // Add basic approval flag
  formatted.requiresApproval = taskHazard.risks?.some(risk => risk.requiresSupervisorSignature) || false;
  
  return formatted;
};

/**
 * Helper function to find task hazard with company validation
 */
const findTaskHazardByIdAndCompany = async (id, companyId, includeAssociations = true) => {
  const whereClause = { id, companyId };
  const options = { where: whereClause };
  
  if (!includeAssociations) {
    const taskHazard = await TaskHazard.unscoped().findOne(options);
    if (!taskHazard) {
      throw new Error("Task Hazard not found");
    }
    return taskHazard;
  }
  
  const taskHazard = await TaskHazard.findOne(options);
  
  if (!taskHazard) {
    throw new Error("Task Hazard not found");
  }
  
  return taskHazard;
};

/**
 * Helper function to update task hazard risks
 * Handles create, update, and delete operations for associated risks
 */
const updateTaskHazardRisks = async (taskHazard, newRisks, transaction) => {
  if (!newRisks || !Array.isArray(newRisks)) {
    return [];
  }

  const processedRisks = processRisks(newRisks);
  const riskMap = new Map();
  
  newRisks.forEach(risk => {
    if (risk.id) {
      riskMap.set(risk.id, risk);
    }
  });

  // Update or delete existing risks
  if (taskHazard.risks && taskHazard.risks.length > 0) {
    await Promise.all(taskHazard.risks.map(async risk => {
      if (riskMap.has(risk.id)) {
        const updatedRisk = riskMap.get(risk.id);
        const processedRisk = processRisks([updatedRisk])[0];
        
        await risk.update(processedRisk, { transaction });
        riskMap.delete(risk.id);
      } else {
        await risk.destroy({ transaction });
      }
    }));
  }

  // Create new risks (those without IDs or not found in existing)
  const newRisksToCreate = newRisks.filter(risk => !risk.id || riskMap.has(risk.id));
  await Promise.all(newRisksToCreate.map(async risk => {
    const processedRisk = processRisks([risk])[0];
    await taskHazard.createRisk(processedRisk, { transaction });
  }));

  return processedRisks;
};

/**
 * Create and Save a new Task Hazard
 * Handles all individuals through the junction table (many-to-many relationship)
 */
exports.create = async (req, res) => {
  let transaction;
  
  try {
    // Start transaction early for consistency
    transaction = await db.sequelize.transaction();
    
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    // Validate required fields
    const missingFields = validateRequiredFields(req.body);
    if (missingFields.length > 0) {
      await transaction.rollback();
      return res.status(400).json(createErrorResponse(
        "Missing required fields",
        {
          missingFields,
          receivedFields: Object.keys(req.body)
        }
      ));
    }

    // Parse and validate individuals (outside transaction for better error handling)
    let individuals, supervisor;
    try {
      individuals = await parseAndValidateIndividuals(req.body.individual, transaction);
      supervisor = await findAndValidateSupervisor(req.body.supervisor, transaction);
    } catch (validationError) {
      await transaction.rollback();
      return res.status(404).json(createErrorResponse(validationError.message));
    }

    // Process risks and determine status
    const processedRisks = processRisks(req.body.risks);
    const status = determineTaskHazardStatus(processedRisks, req.body.status);

    // Create Task Hazard (using junction table for all individuals)
    const taskHazard = await TaskHazard.create({
      companyId: userCompanyId,
      date: req.body.date,
      time: req.body.time,
      scopeOfWork: req.body.scopeOfWork,
      assetHierarchyId: req.body.assetSystem,
      systemLockoutRequired: req.body.systemLockoutRequired || false,
      trainedWorkforce: req.body.trainedWorkforce,
      supervisorId: supervisor.id,
      location: req.body.location,
      status: status,
      geoFenceLimit: req.body.geoFenceLimit || 200
    }, { transaction });

    // Associate all individuals through junction table
    await taskHazard.addIndividuals(individuals, { transaction });

    // Create associated risks
    await Promise.all(processedRisks.map(async risk => {
      await taskHazard.createRisk(risk, { transaction });
    }));
    
    const requiresSignature = req.body.risks.some(risk => risk.requiresSupervisorSignature);
    if(requiresSignature && status === "Pending"){
      // Reload task hazard with all associations for snapshot
      const taskHazardWithAssociations = await TaskHazard.findByPk(taskHazard.id, {
        include: [
          { model: User, as: 'supervisor' },
          { model: User, as: 'individuals' }
        ],
        transaction
      });

      // Create supervisor approval record with snapshot
      const { taskHazardSnapshot, risksSnapshot } = SupervisorApproval.createSnapshot(
        taskHazardWithAssociations
      );

      const supervisorApproval = await SupervisorApproval.create({
        taskHazardId: taskHazard.id,
        supervisorId: supervisor.id,
        status: 'pending',
        taskHazardSnapshot,
        risksSnapshot
      }, { transaction });

      // Create notification for supervisor
      await Notification.create({
        userId: supervisor.id,
        title: "Task Hazard Pending Approval",
        message: "A task hazard requires your approval. Please review the risks and take appropriate actions.",
        type: "approval"
      }, { transaction });
    }
    
    // Commit transaction
    await transaction.commit();

    res.status(201).json(createSuccessResponse(
      "Task Hazard created successfully",
      { taskHazard, risks: processedRisks }
    ));

  } catch (error) {
    // Rollback transaction on any error
    if (transaction) await transaction.rollback();
    
    console.error('Error creating task hazard:', error);
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while creating the Task Hazard."
    ));
  }
};

/**
 * Retrieve supervisor approvals for the authenticated user's company
 * - Admin/superuser: Can see all approvals for the company
 * - Supervisor: Can only see approvals they are responsible for
 */
exports.getAllApprovals = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Check if user has appropriate privileges
    const user = await User.findOne({
      where: { id: req.user.id }
    });

    if (!user || !user.role || !(user.role === "admin" || user.role === "superuser" || user.role === "supervisor")) {
      return res.status(403).json(createErrorResponse("Access denied. Supervisor, admin, or superuser privileges required."));
    }

    // Determine if user is admin/superuser or just supervisor
    const isAdminOrSuperuser = user.role === "admin" || user.role === "superuser";
    const isSupervisor = user.role === "supervisor";

    // Parse query parameters for filtering
    // Optional status filter
    const statusFilter = req.query.status;
    const whereClause = {};
    
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      whereClause.status = statusFilter;
    }

    // Optional invalidated filter
    if (req.query.includeInvalidated !== 'true') {
      whereClause.isInvalidated = false;
    }

    // Add supervisor filter if user is a supervisor (not admin/superuser)
    if (isSupervisor) {
      whereClause.supervisorId = user.id;
    }

    // Get approvals for the company's task hazards (filtered by role)
    const approvals = await SupervisorApproval.findAll({
      include: [
        {
          model: TaskHazard,
          as: 'taskHazard',
          where: { companyId: userCompanyId },
          attributes: ['id', 'date', 'time', 'scopeOfWork', 'location', 'status'],
          include: [
            {
              model: User,
              as: 'individuals',
              attributes: ['id', 'email', 'name'],
              through: { attributes: [] }
            },
            {
              model: TaskRisk,
              as: 'risks',
              attributes: ['id', 'riskDescription', 'riskType', 'asIsLikelihood', 'asIsConsequence', 
                         'mitigatingAction', 'mitigatingActionType', 'mitigatedLikelihood', 
                         'mitigatedConsequence', 'requiresSupervisorSignature']
            }
          ]
        },
        {
          model: User,
          as: 'supervisor',
          attributes: ['id', 'email', 'name', 'role']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Group approvals by task hazard
    const taskHazardMap = new Map();
    
    approvals.forEach(approval => {
      const taskHazardId = approval.taskHazard.id;
      
      if (!taskHazardMap.has(taskHazardId)) {
        taskHazardMap.set(taskHazardId, {
          taskHazard: approval.taskHazard,
          approvals: []
        });
      }
      
      // Add approval to the task hazard
      taskHazardMap.get(taskHazardId).approvals.push(approval);
    });
    
    // Convert map to array and process each task hazard
    const groupedTaskHazards = Array.from(taskHazardMap.values()).map(group => {
      // Sort approvals by creation date (most recent first)
      group.approvals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      const latestApproval = group.approvals[0];
      const taskHazard = group.taskHazard;
      
      // Process each approval with appropriate data source
      const processedApprovals = group.approvals.map((approval, index) => {
        const isLatest = index === 0;
        
        // For latest approval, use live data; for others, use snapshot
        const taskHazardData = isLatest ? {
          id: taskHazard.id,
          date: taskHazard.date,
          time: taskHazard.time,
          scopeOfWork: taskHazard.scopeOfWork,
          location: taskHazard.location,
          status: taskHazard.status,
          individuals: taskHazard.individuals.map(ind => ({
            id: ind.id,
            email: ind.email,
            name: ind.name
          })),
          risks: taskHazard.risks.map(risk => ({
            id: risk.id,
            riskDescription: risk.riskDescription,
            riskType: risk.riskType,
            asIsLikelihood: risk.asIsLikelihood,
            asIsConsequence: risk.asIsConsequence,
            mitigatingAction: risk.mitigatingAction,
            mitigatingActionType: risk.mitigatingActionType,
            mitigatedLikelihood: risk.mitigatedLikelihood,
            mitigatedConsequence: risk.mitigatedConsequence,
            requiresSupervisorSignature: risk.requiresSupervisorSignature
          }))
        } : {
          // Use snapshot data for historical approvals
          ...approval.taskHazardSnapshot,
          risks: approval.risksSnapshot
        };
        
        return {
          id: approval.id,
          status: approval.status,
          createdAt: approval.createdAt,
          processedAt: approval.processedAt,
          comments: approval.comments,
          isInvalidated: approval.isInvalidated,
          isLatest: isLatest,
          supervisor: {
            id: approval.supervisor.id,
            email: approval.supervisor.email,
            name: approval.supervisor.name,
            role: approval.supervisor.role
          },
          taskHazardData: taskHazardData
        };
      });
      
      return {
        id: taskHazard.id,
        date: taskHazard.date,
        time: taskHazard.time,
        scopeOfWork: taskHazard.scopeOfWork,
        location: taskHazard.location,
        status: taskHazard.status,
        individuals: taskHazard.individuals.map(ind => ({
          id: ind.id,
          email: ind.email,
          name: ind.name
        })),
        risks: taskHazard.risks.map(risk => ({
          id: risk.id,
          riskDescription: risk.riskDescription,
          riskType: risk.riskType,
          asIsLikelihood: risk.asIsLikelihood,
          asIsConsequence: risk.asIsConsequence,
          mitigatingAction: risk.mitigatingAction,
          mitigatingActionType: risk.mitigatingActionType,
          mitigatedLikelihood: risk.mitigatedLikelihood,
          mitigatedConsequence: risk.mitigatedConsequence,
          requiresSupervisorSignature: risk.requiresSupervisorSignature
        })),
        approvals: processedApprovals
      };
    });
    
    // Sort task hazards by most recent date
    groupedTaskHazards.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(createSuccessResponse(
      "Supervisor approvals retrieved successfully",
      {
        taskHazards: groupedTaskHazards,
        totalTasks: groupedTaskHazards.length,
        totalApprovals: approvals.length,
        filters: {
          status: statusFilter || 'all',
          includeInvalidated: req.query.includeInvalidated === 'true',
        },
      }
    ));

  } catch (error) {
    console.error('Error retrieving supervisor approvals:', error);
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while retrieving supervisor approvals."
    ));
  }
};

/**
 * Retrieve all Task Hazards from the database for the authenticated user's company
 * Uses optimized queries with proper association loading
 */
exports.findAll = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Fetch task hazards with optimized query (default scope includes all needed associations)
    const taskHazards = await TaskHazard.findAll({
      where: { companyId: userCompanyId }
      // Default scope automatically includes: company, risks, supervisor, individuals
    });

    // Format for frontend response
    const formattedTaskHazards = taskHazards.map(formatTaskHazard);

    res.status(200).json(createSuccessResponse(
      "Task Hazards retrieved successfully",
      formattedTaskHazards
    ));
    
  } catch (error) {
    console.error('Error retrieving task hazards:', error);
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while retrieving task hazards."
    ));
  }
};

/**
 * Find a single Task Hazard by ID with company validation
 * Returns formatted data including all associated individuals from junction table
 * Optional query parameter: includeApprovalInfo=true to include approval details
 */
exports.findOne = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(req.params.id, userCompanyId);

    // Format for frontend response
    const formattedTaskHazard = formatTaskHazard(taskHazard);

    // Optionally include approval information
    if (req.query.includeApprovalInfo === 'true') {
      formattedTaskHazard.approvalInfo = await getApprovalInfo(req.params.id);
    }

    res.status(200).json(createSuccessResponse(
      "Task Hazard retrieved successfully",
      formattedTaskHazard
    ));
    
  } catch (error) {
    console.error('Error retrieving task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return res.status(404).json(createErrorResponse(error.message));
    }
    
    res.status(500).json(createErrorResponse(
      error.message || `Error retrieving Task Hazard with id ${req.params.id}`
    ));
  }
};

/**
 * Update a Task Hazard by ID
 * Handles individuals through junction table and optimizes transaction usage
 */
exports.update = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    const user = await User.findOne({
      where: {
        id: req.user.id
      }
    });
    if(!user || !user?.role){
      return res.status(403).json(createErrorResponse("Submitting user not found"));
    }

    // Find task hazard with company validation and current approval (before starting transaction)
    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);

    if(!taskHazard){
      return res.status(404).json(createErrorResponse("Task Hazard not found"));
    }

    // Get current active approval if exists
    const currentApproval = await SupervisorApproval.findOne({
      where: {
        taskHazardId: req.body.id
      },
      order: [['createdAt', 'DESC']]
    });

    // Check if any risks require supervisor signature
    const requiresSignature = req.body.risks.some(risk => risk.requiresSupervisorSignature);

    // Determine final status
    let status = req.body.status;
    
    // If any risks require signature and task is being updated (not completed), set to Pending
    if (requiresSignature && req.body.status !== "Completed") {
      status = 'Pending';
    }

    // Validate individuals and supervisor (before transaction for better error handling)
    let individuals, supervisor;
    try {
      individuals = await parseAndValidateIndividuals(req.body.individual);
      supervisor = await findAndValidateSupervisor(req.body.supervisor);
    } catch (validationError) {
      return res.status(404).json(createErrorResponse(validationError.message));
    }

    // Start transaction for data modifications
    const result = await db.sequelize.transaction(async (transaction) => {
      // Update Task Hazard main fields
      await taskHazard.update({
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        assetHierarchyId: req.body.assetSystem || taskHazard.assetHierarchyId,
        systemLockoutRequired: req.body.systemLockoutRequired,
        trainedWorkforce: req.body.trainedWorkforce,
        supervisorId: supervisor.id,
        location: req.body.location,
        status: status,
        geoFenceLimit: req.body.geoFenceLimit
      }, { transaction });

      // Update individuals association through junction table
      await taskHazard.setIndividuals(individuals, { transaction });

      // Update associated risks if provided
      let updatedRisks = [];
      if (req.body.risks && Array.isArray(req.body.risks)) {
        updatedRisks = await updateTaskHazardRisks(taskHazard, req.body.risks, transaction);
      }

      // Handle approval logic - if status is Pending and requires signature, create approval record
      if (requiresSignature && status === "Pending") {
        // Reload task hazard with associations for snapshot
        const taskHazardWithAssociations = await TaskHazard.findByPk(taskHazard.id, {
          include: [
            { model: User, as: 'supervisor' },
            { model: User, as: 'individuals' }
          ],
          transaction
        });

        // Create snapshot for the approval
        const { taskHazardSnapshot, risksSnapshot } = SupervisorApproval.createSnapshot(
          taskHazardWithAssociations
        );

        // Handle existing approval
        if (currentApproval) {
          // Invalidate the existing approval
          await currentApproval.invalidate(null, transaction);

          // Create new approval record
          const newApproval = await SupervisorApproval.create({
            taskHazardId: taskHazard.id,
            supervisorId: supervisor.id,
            status: 'pending',
            taskHazardSnapshot,
            risksSnapshot
          }, { transaction });

          // Update the invalidated approval to reference the new one
          await currentApproval.update({
            replacedByApprovalId: newApproval.id
          }, { transaction });

          // Create notification for supervisor (re-approval)
          await Notification.create({
            userId: supervisor.id,
            title: "Task Hazard Requires Re-approval",
            message: "A task hazard has been modified and requires your re-approval.",
            type: "approval"
          }, { transaction });
        } else {
          // No existing approval - create new one
          await SupervisorApproval.create({
            taskHazardId: taskHazard.id,
            supervisorId: supervisor.id,
            status: 'pending',
            taskHazardSnapshot,
            risksSnapshot
          }, { transaction });

          // Create notification for supervisor (new approval)
          await Notification.create({
            userId: supervisor.id,
            title: "Task Hazard Pending Approval",
            message: "A task hazard requires your approval. Please review the risks and take appropriate actions.",
            type: "approval"
          }, { transaction });
        }
      }

      return { taskHazard, risks: updatedRisks };
    });

    res.status(200).json(createSuccessResponse(
      "Task Hazard updated successfully",
      result
    ));

  } catch (error) {
    console.error('Error updating task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return res.status(404).json(createErrorResponse(error.message));
    }
    
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while updating the Task Hazard."
    ));
  }
};

/**
 * Supervisor approval of a task hazard
 * Updates the approval record and task hazard status
 * Creates notifications for individuals in the task hazard
 */
exports.supervisorApproval = async (req, res) => {
  let transaction;
  
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    const user = await User.findOne({
      where: {
        id: req.user.id
      }
    });

    if(!user || !user?.role || user.role === "user"){
      return res.status(403).json(createErrorResponse("Access denied. Supervisor privileges required to approve task hazards."));
    }

    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);
    if(taskHazard.status !== "Pending"){
      return res.status(400).json(createErrorResponse("Task hazard is not pending approval."));
    }

    // Find the current pending approval
    const pendingApproval = await SupervisorApproval.findOne({
      where: {
        taskHazardId: req.body.id,
        status: 'pending',
        isInvalidated: false
      }
    });

    if (!pendingApproval) {
      return res.status(404).json(createErrorResponse("No pending approval found for this task hazard."));
    }

    transaction = await db.sequelize.transaction();

    let updatedTaskHazard;
    let approvalAction;
    let comments = `Updated by: ${user.id}.`;
    let additionalComments = req.body.additionalComments || "";
    comments += ` Comments: ${additionalComments}`;

    // Handle approval or rejection
    if (req.body.status === 'Approved') {
      // Approve the approval record
      await pendingApproval.approve(comments, transaction);
      
      // Update task hazard status
      updatedTaskHazard = await taskHazard.update({
        status: 'Active'  // or whatever status indicates approved
      }, { transaction });

      approvalAction = 'approved';

    } else if (req.body.status === 'Rejected') {
      // Reject the approval record
      await pendingApproval.reject(comments, transaction);
      
      // Update task hazard status
      updatedTaskHazard = await taskHazard.update({
        status: 'Rejected'
      }, { transaction });

      approvalAction = 'rejected';

    } else {
      await transaction.rollback();
      return res.status(400).json(createErrorResponse("Invalid approval status. Must be 'Approved' or 'Rejected'."));
    }

    // Create notifications for all individuals
    await Promise.all(updatedTaskHazard.individuals.map(async individual => {
      await Notification.create({
        userId: individual.id,
        title: `Task Hazard ${approvalAction.charAt(0).toUpperCase() + approvalAction.slice(1)}`,
        message: `A task hazard you are part of has been ${approvalAction} by your supervisor.`,
        type: "hazard"
      }, { transaction });
    }));

    await transaction.commit();

    // Return response with approval details
    const response = {
      taskHazard: updatedTaskHazard,
      approval: {
        id: pendingApproval.id,
        status: pendingApproval.status,
        processedAt: pendingApproval.processedAt,
        comments: pendingApproval.comments,
        supervisor: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    };

    res.status(200).json(createSuccessResponse(
      `Task hazard ${approvalAction} successfully`, 
      response
    ));

  } catch (error) {
    if (transaction) await transaction.rollback();
    
    console.error('Error processing supervisor approval:', error);
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while processing the approval."
    ));
  }
}

/**
 * Get approval history for a specific task hazard
 * Returns all approval records including invalidated ones for audit trail
 */
exports.getApprovalHistory = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(req.params.id, userCompanyId, false);

    // Get all approval records for this task hazard (including invalidated ones)
    const approvalHistory = await SupervisorApproval.findAll({
      where: { taskHazardId: req.params.id },
      include: [
        { 
          model: User, 
          as: 'supervisor', 
          attributes: ['id', 'email', 'name', 'role'] 
        },
        {
          model: SupervisorApproval,
          as: 'replacedByApproval',
          required: false,
          attributes: ['id', 'status', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Format approval history for response
    const formattedHistory = approvalHistory.map(approval => ({
      id: approval.id,
      status: approval.status,
      createdAt: approval.createdAt,
      processedAt: approval.processedAt,
      comments: approval.comments,
      isInvalidated: approval.isInvalidated,
      supervisor: {
        id: approval.supervisor.id,
        email: approval.supervisor.email,
        name: approval.supervisor.name,
        role: approval.supervisor.role
      },
      taskHazardSnapshot: approval.taskHazardSnapshot,
      risksSnapshot: approval.risksSnapshot,
      replacedBy: approval.replacedByApproval ? {
        id: approval.replacedByApproval.id,
        status: approval.replacedByApproval.status,
        createdAt: approval.replacedByApproval.createdAt
      } : null
    }));

    res.status(200).json(createSuccessResponse(
      "Approval history retrieved successfully",
      {
        taskHazardId: taskHazard.id,
        totalApprovals: formattedHistory.length,
        approvals: formattedHistory
      }
    ));

  } catch (error) {
    console.error('Error retrieving approval history:', error);
    
    if (error.message === "Task Hazard not found") {
      return res.status(404).json(createErrorResponse(error.message));
    }
    
    res.status(500).json(createErrorResponse(
      error.message || `Error retrieving approval history for Task Hazard with id ${req.params.id}`
    ));
  }
};

/**
 * Delete a Task Hazard with the specified ID
 * Handles cascade deletion of associated risks and junction table entries
 */
exports.delete = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    const id = req.params.id;
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(id, userCompanyId, false);

    // Delete within transaction for data consistency
    await db.sequelize.transaction(async (transaction) => {
      // Delete associated risks (foreign key constraint requires this first)
      await TaskRisk.destroy({
        where: { taskHazardId: id },
        transaction
      });

      // Delete the task hazard (junction table entries will be cascade deleted)
      await taskHazard.destroy({ transaction });
    });

    res.status(200).json(createSuccessResponse("Task Hazard deleted successfully"));

  } catch (error) {
    console.error('Error deleting task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return res.status(404).json(createErrorResponse(error.message));
    }
    
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while deleting the Task Hazard."
    ));
  }
};