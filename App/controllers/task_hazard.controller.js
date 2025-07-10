const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const User = db.user;
const Notification = db.notifications;

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
  
  return formatted;
};

/**
 * Helper function to find task hazard with company validation
 */
const findTaskHazardByIdAndCompany = async (id, companyId, includeAssociations = true) => {
  const whereClause = { id, companyId };
  const options = { where: whereClause };
  
  // Only include associations if needed (optimization for queries that don't need them)
  if (includeAssociations) {
    // Let the default scope handle associations
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
      const notification = await Notification.create({
        userId: supervisor.id,
        title: "Task Hazard Pending",
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
 */
exports.findOne = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Find task hazard with company validation
    const taskHazard = await findTaskHazardByIdAndCompany(req.params.id, userCompanyId);

    // Format for frontend response
    const formattedTaskHazard = formatTaskHazard(taskHazard);

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

    // When a regular user makes changes to a task hazard that required a supervisor signature, the task hazard will be set back to pending
    // as reapproval is required. Except when changing the status to completed.
    const requiresSignature = req.body.risks.some(risk => risk.requiresSupervisorSignature);
    let status = req.body.status;
    if(requiresSignature && user.role === "user" && req.body.status !== "Completed"){
      status = determineTaskHazardStatus(req.body.risks, status);
    }

    // Find task hazard with company validation (before starting transaction)
    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);

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

      if(requiresSignature && status === "Pending"){
        const notification = await Notification.create({
          userId: supervisor.id,
          title: "Task Hazard Pending",
          message: "A task hazard requires your approval. Please review the risks and take appropriate actions.",
          type: "approval"
        }, { transaction });
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
 * Updates the task hazard status to the requested status
 * Creates a notification for each individual in the task hazard
 */
exports.supervisorApproval = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    const user = await User.findOne({
      where: {
        id: req.user.id
      }
    });

    if(!user || !user?.role || !(user.role === "supervisor" || user.role === "admin" || user.role === "superuser")){
      return res.status(403).json(createErrorResponse("Access denied. Supervisor privileges required to approve task hazards."));
    }

    const taskHazard = await findTaskHazardByIdAndCompany(req.body.id, userCompanyId);
    if(taskHazard.status !== "Pending"){
      return res.status(400).json(createErrorResponse("Task hazard is not pending approval."));
    }

    const transaction = await db.sequelize.transaction();

    const updatedTaskHazard = await taskHazard.update({
      status: req.body.status
    }, { transaction });

    await Promise.all(updatedTaskHazard.individuals.map(async individual => {
      await Notification.create({
        userId: individual.id,
        title: "Task Hazard Updated",
        message: "The status of a task hazard you are apart of has been updated.",
        type: "hazard"
      }, { transaction });
    }));
    await transaction.commit();

    res.status(200).json(createSuccessResponse("Task hazard status updated successfully", updatedTaskHazard));

  } catch (error) {
    console.error('Error updating task hazard:', error);
    res.status(500).json(createErrorResponse(
      error.message || "Some error occurred while updating the Task Hazard."
    ));
  }
}

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