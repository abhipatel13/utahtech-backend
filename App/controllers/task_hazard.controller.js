const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const User = db.user;
const SupervisorApproval = db.supervisor_approvals;
const { successResponse, errorResponse, sendResponse, paginatedResponse } = require('../helper/responseHelper');
const { getCompanyId } = require('../helper/controllerHelper');
const { Op } = require('sequelize');
const supervisorApprovalController = require('./supervisor_approval.controller');
const { createNotificationWithEmail } = require('./notificationController');

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
 * Uses polymorphic fields internally but returns backwards compatible response
 */
const getApprovalInfo = async (taskHazardId) => {
  try {
    // Get current active approval (not invalidated) using polymorphic fields
    const currentApproval = await SupervisorApproval.findOne({
      where: {
        approvableId: taskHazardId,
        approvableType: 'task_hazards',
        isInvalidated: false
      },
      include: [
        { model: User, as: 'supervisor', attributes: ['id', 'email', 'name', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if(currentApproval){
      return {
        id: currentApproval?.id,
        status: currentApproval?.status,
        createdAt: currentApproval?.createdAt,
        processedAt: currentApproval?.processedAt,
        comments: currentApproval?.comments,
        isInvalidated: false,
        isLatest: true,
        supervisor: currentApproval?.supervisor,
        // Backwards compatible field name
        taskHazardData: currentApproval?.approvableSnapshot,
        // Also include new field name for forward compatibility
        approvableData: currentApproval?.approvableSnapshot,
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching approval info:', error);
    return null;
  }
};

/**
 * Helper function to format task hazard for frontend response
 * Converts junction table associations to comma-separated email string
 */
// TODO: Remove individual field after updating mobile app
const formatTaskHazard = (taskHazard) => {
  const formatted = {
    ...taskHazard.get({ plain: true }),
    supervisor: taskHazard.supervisor?.email || '',
  };
  
  // Get all individuals from the many-to-many association via junction table
  if (taskHazard.individuals && taskHazard.individuals.length > 0) {
    formatted.individual = taskHazard.individuals.map(user => user.email).join(', ');
    formatted.individuals = taskHazard.individuals.map(user => user.email).join(', ');
  } else {
    formatted.individual = ''; // No individuals assigned
    formatted.individuals = ''; // No individuals assigned
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
    const userCompanyId = getCompanyId(req);

    //TODO: Remove individual after updating the mobile app
    let individualsString = req.body.individuals ? req.body.individuals : req.body.individual;
    if (!individualsString) {
      return sendResponse(res, errorResponse("individuals or individual is required", 400));
    }

    // Parse and validate individuals (database lookup)
    let individuals, supervisor;
    try {
      individuals = await parseAndValidateIndividuals(individualsString, transaction);
      supervisor = await findAndValidateSupervisor(req.body.supervisor, transaction);
    } catch (validationError) {
      await transaction.rollback();
      return sendResponse(res, errorResponse(validationError.message, 404));
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
      geofenceLimit: req.body.geoFenceLimit || 200
    }, { transaction });

    // Associate all individuals through junction table
    await taskHazard.addIndividuals(individuals, { transaction });

    // Create associated risks
    await Promise.all(processedRisks.map(async risk => {
      await taskHazard.createRisk(risk, { transaction });
    }));
    
    // Create supervisor approval if any risks require supervisor signature
    const requiresSignature = req.body.risks.some(risk => risk.requiresSupervisorSignature);
    if(requiresSignature && status === "Pending"){
      await supervisorApprovalController.createApproval(
        taskHazard.id,
        'task_hazards',
        supervisor.id,
        transaction
      );
    }
    
    // Commit transaction
    await transaction.commit();

    sendResponse(res, successResponse(
      "Task Hazard created successfully",
      { taskHazard, risks: processedRisks },
      201
    ));

  } catch (error) {
    // Rollback transaction on any error
    if (transaction) await transaction.rollback();
    
    console.error('Error creating task hazard:', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while creating the Task Hazard.",
      500
    ));
  }
};

/**
 * Retrieve supervisor approvals for the authenticated user's company
 * - Admin/superuser: Can see all approvals for the company
 * - Supervisor: Can only see approvals they are responsible for
 * 
 * BACKWARDS COMPATIBLE: Returns same response format as before migration
 * Uses polymorphic fields internally but returns taskHazards array with taskHazardData
 */
exports.getAllApprovals = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = req.user.company?.id;
    
    // Check if user has appropriate privileges
    const user = req.user;

    if (!user || !user.role || !(user.role === "admin" || user.role === "superuser" || user.role === "supervisor")) {
      return sendResponse(res, errorResponse("Access denied. Supervisor, admin, or superuser privileges required.", 403));
    }

    // Determine if user is admin/superuser or just supervisor
    const isAdminOrSuperuser = user.role === "admin" || user.role === "superuser";
    const isSupervisor = user.role === "supervisor";

    // Parse query parameters for filtering
    // Optional status filter
    const statusFilter = req.query.status;
    const whereClause = {
      // Filter to only task_hazards type for this endpoint (backwards compat)
      approvableType: 'task_hazards'
    };
    
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
    // Using polymorphic association alias 'task_hazards'
    const approvals = await SupervisorApproval.findAll({
      include: [
        {
          model: TaskHazard,
          as: 'task_hazards',
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
    console.log("approvals:", approvals.length);

    // Group approvals by task hazard (using approvableId from polymorphic field)
    const taskHazardMap = new Map();
    
    approvals.forEach(approval => {
      // Use approvable (set by afterFind hook) or fall back to approvableId
      const taskHazard = approval.approvable;
      const taskHazardId = approval.approvableId;
      
      if (!taskHazardMap.has(taskHazardId)) {
        taskHazardMap.set(taskHazardId, {
          taskHazard: taskHazard,
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
        // Using approvableSnapshot internally but returning as taskHazardData for backwards compat
        const taskHazardData = isLatest && taskHazard ? {
          id: taskHazard.id,
          date: taskHazard.date,
          time: taskHazard.time,
          scopeOfWork: taskHazard.scopeOfWork,
          location: taskHazard.location,
          status: taskHazard.status,
          individuals: taskHazard.individuals ? taskHazard.individuals.map(ind => ({
            id: ind.id,
            email: ind.email,
            name: ind.name
          })) : [],
          risks: taskHazard.risks ? taskHazard.risks.map(risk => ({
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
          })) : []
        } : {
          // Use snapshot data for historical approvals (approvableSnapshot for polymorphic)
          ...approval.approvableSnapshot,
          risks: approval.risksSnapshot
        };

        console.log("supervisor id:", approval.supervisor?.id);
        console.log("supervisor email:", approval.supervisor?.email);
        console.log("supervisor name:", approval.supervisor?.name);
        console.log("supervisor role:", approval.supervisor?.role);
        
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
          // Backwards compatible field name
          taskHazardData: taskHazardData
        };
      });
      
      return {
        id: taskHazard ? taskHazard.id : latestApproval.approvableId,
        date: taskHazard ? taskHazard.date : latestApproval.approvableSnapshot?.date,
        time: taskHazard ? taskHazard.time : latestApproval.approvableSnapshot?.time,
        scopeOfWork: taskHazard ? taskHazard.scopeOfWork : latestApproval.approvableSnapshot?.scopeOfWork,
        location: taskHazard ? taskHazard.location : latestApproval.approvableSnapshot?.location,
        status: taskHazard ? taskHazard.status : latestApproval.approvableSnapshot?.status,
        individuals: taskHazard && taskHazard.individuals ? taskHazard.individuals.map(ind => ({
          id: ind.id,
          email: ind.email,
          name: ind.name
        })) : (latestApproval.approvableSnapshot?.individuals || []),
        risks: taskHazard && taskHazard.risks ? taskHazard.risks.map(risk => ({
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
        })) : (latestApproval.risksSnapshot || []),
        approvals: processedApprovals
      };
    });
    
    // Sort task hazards by most recent date
    groupedTaskHazards.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Response maintains backwards compatible structure
    sendResponse(res, successResponse(
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
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while retrieving supervisor approvals.",
      500
    ));
  }
};

/**
 * Retrieve all Task Hazards from the database for the authenticated user's company
 * Uses optimized queries with proper association loading and pagination
 */
exports.findAll = async (req, res) => {
  try {
    // Build effective where clause
    let effectiveWhere = {};

    if (req.whereClause && typeof req.whereClause === 'object') {
      const wc = req.whereClause;
      if (wc.companyId || wc.company_id) effectiveWhere.companyId = wc.companyId ?? wc.company_id;
    }

    // If nothing provided by middleware, derive from helpers (non-universal users)
    if ((!effectiveWhere.companyId ) && req.user?.role !== 'universal_user') {
      const userCompanyId = getCompanyId(req);
      if (userCompanyId) effectiveWhere.companyId = userCompanyId;
    }

    // Get pagination and search
    const { page, limit, offset, search } = req.query;

    // Apply simple search on scopeOfWork/location
    if (search) {
      effectiveWhere[Op.or] = [
        { scopeOfWork: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } }
      ];
    }

    // Fetch with distinct to prevent overcount due to joins in default scope
    const { count, rows: taskHazards } = await TaskHazard.unscoped().findAndCountAll({
      where: effectiveWhere,
      include: [
        { model: db.company, 
          as: 'company', 
          attributes: ['id', 'name'] },
        { model: db.task_risks, as: 'risks'},
        { model: db.user, as: 'supervisor', attributes: ["id", "email", "name", "role"] },
        { model: db.user, as: 'individuals', attributes: ["id", "email", "name", "role"] }
      ],
      attributes: [
        'id', 
        'date', 
        'time', 
        'scopeOfWork', 
        ['asset_hierarchy_id', 'assetSystem'], 
        'systemLockoutRequired', 
        'trainedWorkforce', 
        'location', 
        'status', 
        'geofenceLimit',
        'createdAt'
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true
    });

    console.log("task hazard count:", count);

    // Format for frontend response
    const formattedTaskHazards = taskHazards.map(formatTaskHazard);

    // Send paginated response using helper
    sendResponse(res, paginatedResponse(
      formattedTaskHazards,
      page,
      limit,
      count,
      "Task Hazards retrieved successfully"
    ));
    
  } catch (error) {
    console.error('Error retrieving task hazards:', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while retrieving task hazards.",
      500
    ));
  }
};

/**
 * Retrieve Task Hazards with minimal data for table/list display
 * Optimized for performance - excludes heavy associations like risks
 */
exports.findAllMinimal = async (req, res) => {
  try {
    // Build effective where clause
    let effectiveWhere = {};

    if (req.whereClause && typeof req.whereClause === 'object') {
      const wc = req.whereClause;
      if (wc.companyId || wc.company_id) effectiveWhere.companyId = wc.companyId ?? wc.company_id;
    }

    // If nothing provided by middleware, derive from helpers (non-universal users)
    if ((!effectiveWhere.companyId ) && req.user?.role !== 'universal_user') {
      const userCompanyId = getCompanyId(req);
      if (userCompanyId) effectiveWhere.companyId = userCompanyId;
    }

    // Get pagination and search
    const { page, limit, offset, search } = req.query;

    // Apply simple search on scopeOfWork/location
    if (search) {
      effectiveWhere[Op.or] = [
        { scopeOfWork: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } }
      ];
    }

    // Fetch minimal data with limited associations
    const { count, rows: taskHazards } = await TaskHazard.unscoped().findAndCountAll({
      where: effectiveWhere,
      include: [
        { model: db.company, 
          as: 'company', 
          attributes: ['id', 'name'] },
        { model: db.task_risks, as: 'risks'},
        { model: db.user, as: 'supervisor', attributes: ["email"] }
      ],
      attributes: [
        'id', 
        'date', 
        'time', 
        'scopeOfWork', 
        ['asset_hierarchy_id', 'assetSystem'], 
        'location', 
        'status', 
        'createdAt'
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true
    });

    // Format minimal response
    const formattedTaskHazards = taskHazards.map(taskHazard => ({
      id: taskHazard.id,
      date: taskHazard.date,
      time: taskHazard.time,
      scopeOfWork: taskHazard.scopeOfWork,
      assetSystem: taskHazard.assetSystem,
      location: taskHazard.location,
      status: taskHazard.status,
      supervisor: taskHazard.supervisor?.email || '',
      createdAt: taskHazard.createdAt
    }));

    // Send paginated response using helper
    sendResponse(res, paginatedResponse(
      formattedTaskHazards,
      page,
      limit,
      count,
      "Task Hazards (minimal) retrieved successfully"
    ));
    
  } catch (error) {
    console.error('Error retrieving task hazards (minimal):', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while retrieving task hazards.",
      500
    ));
  }
};

/**
 * Find Task Hazards by Company ID (for universal users only)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findByCompany = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    // Only universal users can access this endpoint
    if (req.user?.role !== 'universal_user') {
      const response = errorResponse("Access denied. Universal user role required.", 403);
      return sendResponse(res, response);
    }

    // Validate company_id parameter
    if (!company_id) {
      const response = errorResponse("Company ID is required", 400);
      return sendResponse(res, response);
    }

    // Get pagination parameters
    const { page, limit, offset } = req.pagination || { page: 1, limit: 100, offset: 0 };
    
    // Build where clause based on company selection
    let whereClause = {};
    
    if (company_id !== 'all') {
      // Validate that company_id is a number
      const companyIdNum = parseInt(company_id);
      if (isNaN(companyIdNum)) {
        const response = errorResponse("Invalid company ID format", 400);
        return sendResponse(res, response);
      }
      whereClause.companyId = companyIdNum;
    }
    // If company_id is 'all', no filtering is applied (empty whereClause)

    const { count, rows: taskHazards } = await TaskHazard.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: db.company,
          as: 'company',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      distinct: true

    });

    // Format for frontend response
    const formattedTaskHazards = taskHazards.map(formatTaskHazard);

    // Send paginated response using helper
    sendResponse(res, paginatedResponse(
      formattedTaskHazards,
      page,
      limit,
      count,
      company_id === 'all' 
        ? "All task hazards retrieved successfully" 
        : `Task hazards for company ${company_id} retrieved successfully`
    ));
  } catch (error) {
    console.error('Error retrieving task hazards by company:', error);
    const response = errorResponse(
      error.message || "Some error occurred while retrieving task hazards by company.",
      500
    );
    sendResponse(res, response);
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
    const userCompanyId = getCompanyId(req);
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(req.params.id, userCompanyId);

    // Format for frontend response
    const formattedTaskHazard = formatTaskHazard(taskHazard);

    formattedTaskHazard.latestApproval = await getApprovalInfo(req.params.id);

    sendResponse(res, successResponse(
      "Task Hazard retrieved successfully",
      formattedTaskHazard
    ));
    
  } catch (error) {
    console.error('Error retrieving task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return sendResponse(res, errorResponse(error.message, 404));
    }
    
    sendResponse(res, errorResponse(
      error.message || `Error retrieving Task Hazard with id ${req.params.id}`,
      500
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
    const userCompanyId = getCompanyId(req);

    const user = await User.findOne({
      where: {
        id: req.user.id
      }
    });
    if(!user || !user?.role){
      return sendResponse(res, errorResponse("Submitting user not found", 403));
    }

    // Find task hazard with company validation and current approval (before starting transaction)
    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);

    if(!taskHazard){
      return sendResponse(res, errorResponse("Task Hazard not found", 404));
    }

    // Get current active approval if exists (using polymorphic fields)
    const currentApproval = await SupervisorApproval.findOne({
      where: {
        approvableId: req.body.id,
        approvableType: 'task_hazards'
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

    
    //TODO: Remove individual after updating the mobile app
    let individualsString = req.body.individuals ? req.body.individuals : req.body.individual;
    if (!individualsString) {
      return sendResponse(res, errorResponse("individuals or individual is required", 400));
    }

    // Validate individuals and supervisor (before transaction for better error handling)
    let individuals, supervisor;
    try {
      individuals = await parseAndValidateIndividuals(individualsString);
      supervisor = await findAndValidateSupervisor(req.body.supervisor);
    } catch (validationError) {
      return sendResponse(res, errorResponse(validationError.message, 404));
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
        geofenceLimit: req.body.geoFenceLimit
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
        if (currentApproval) {
          // Handle re-approval using centralized function
          await supervisorApprovalController.handleReapproval(
            taskHazard.id,
            'task_hazards',
            supervisor.id,
            currentApproval,
            transaction
          );
        } else {
          // Create new approval using centralized function
          await supervisorApprovalController.createApproval(
            taskHazard.id,
            'task_hazards',
            supervisor.id,
            transaction
          );
        }
      }

      return { taskHazard, risks: updatedRisks };
    });

    sendResponse(res, successResponse(
      "Task Hazard updated successfully",
      result
    ));

  } catch (error) {
    console.error('Error updating task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return sendResponse(res, errorResponse(error.message, 404));
    }
    
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while updating the Task Hazard.",
      500
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
    const userCompanyId = getCompanyId(req);
    const user = req.user;

    if(!user || !user?.role || user.role === "user"){
      return sendResponse(res, errorResponse("Access denied. Supervisor privileges required to approve task hazards.", 403));
    }
    console.log("userCompanyId:", userCompanyId);
    console.log("id:", req.body.id);

    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);
    if(taskHazard.status !== "Pending"){
      return sendResponse(res, errorResponse("Task hazard is not pending approval.", 400));
    }

    // Find the current pending approval using polymorphic fields
    const pendingApproval = await SupervisorApproval.findOne({
      where: {
        approvableId: req.body.id,
        approvableType: 'task_hazards',
        status: 'pending',
        isInvalidated: false
      }
    });

    if (!pendingApproval) {
      return sendResponse(res, errorResponse("No pending approval found for this task hazard.", 404));
    }

    transaction = await db.sequelize.transaction();

    let userName = user.name || user.email || user.id;

    let updatedTaskHazard;
    let approvalAction;
    let comments = `Updated by: ${userName}.`;
    let additionalComments = req.body.comments || "";
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
      return sendResponse(res, errorResponse("Invalid approval status. Must be 'Approved' or 'Rejected'.", 400));
    }

    // Create notifications and send emails for all individuals
    const actionTitle = `Task Hazard ${approvalAction.charAt(0).toUpperCase() + approvalAction.slice(1)}`;
    
    // Build message with rejection reason if applicable
    let notificationMessage = `A task hazard you are part of has been ${approvalAction} by your supervisor.`;
    if (approvalAction === 'rejected' && additionalComments) {
      notificationMessage += ` Reason: ${additionalComments}`;
    }
    
    await Promise.all(updatedTaskHazard.individuals.map(async individual => {
      await createNotificationWithEmail({
        userId: individual.id,
        title: actionTitle,
        message: notificationMessage,
        type: 'hazard',
        transaction
      });
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

    sendResponse(res, successResponse(
      `Task hazard ${approvalAction} successfully`, 
      response
    ));

  } catch (error) {
    if (transaction) await transaction.rollback();
    
    console.error('Error processing supervisor approval:', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while processing the approval.",
      500
    ));
  }
}

/**
 * Get approval history for a specific task hazard
 * Returns all approval records including invalidated ones for audit trail
 * 
 * BACKWARDS COMPATIBLE: Returns taskHazardSnapshot field for mobile compatibility
 */
exports.getApprovalHistory = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getCompanyId(req);
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(req.params.id, userCompanyId, false);

    // Get all approval records for this task hazard (including invalidated ones)
    // Using polymorphic fields
    const approvalHistory = await SupervisorApproval.findAll({
      where: { 
        approvableId: req.params.id,
        approvableType: 'task_hazards'
      },
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

    // Format approval history for response with backwards compatible field names
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
      // Backwards compatible field name (uses approvableSnapshot internally)
      taskHazardSnapshot: approval.approvableSnapshot,
      // Also include new field name for forward compatibility
      approvableSnapshot: approval.approvableSnapshot,
      risksSnapshot: approval.risksSnapshot,
      replacedBy: approval.replacedByApproval ? {
        id: approval.replacedByApproval.id,
        status: approval.replacedByApproval.status,
        createdAt: approval.replacedByApproval.createdAt
      } : null
    }));

    sendResponse(res, successResponse(
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
      return sendResponse(res, errorResponse(error.message, 404));
    }
    
    sendResponse(res, errorResponse(
      error.message || `Error retrieving approval history for Task Hazard with id ${req.params.id}`,
      500
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
    const userCompanyId = getCompanyId(req);
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

    sendResponse(res, successResponse("Task Hazard deleted successfully"));

  } catch (error) {
    console.error('Error deleting task hazard:', error);
    
    if (error.message === "Task Hazard not found") {
      return sendResponse(res, errorResponse(error.message, 404));
    }
    
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while deleting the Task Hazard.",
      500
    ));
  }
};

/**
 * Delete a Task Hazard from any company (Universal User only)
 * Bypasses company access restrictions for universal users
 */
exports.deleteUniversal = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      return sendResponse(res, errorResponse(
        'Access denied. Only universal users can delete task hazards across companies.',
        403
      ));
    }

    const id = req.params.id;
    
    // Find task hazard without company validation (universal access)
    const taskHazard = await TaskHazard.findByPk(id);
    
    if (!taskHazard) {
      return sendResponse(res, errorResponse("Task Hazard not found", 404));
    }

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

    sendResponse(res, successResponse("Task Hazard deleted successfully by universal user"));

  } catch (error) {
    console.error('Error deleting task hazard (universal):', error);
    
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while deleting the Task Hazard.",
      500
    ));
  }
};