const db = require("../models");
const RiskAssessment = db.risk_assessments;
const RiskAssessmentRisk = db.risk_assessment_risks;
const User = db.user;

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
 * Helper function to validate required fields for risk assessment creation/update
 */
const validateRequiredFields = (body) => {
  const missingFields = [];
  const requiredFields = [
    { field: 'date', name: 'Date' },
    { field: 'time', name: 'Time' },
    { field: 'scopeOfWork', name: 'Scope of Work' },
    { field: 'trainedWorkforce', name: 'Trained Workforce' },
    { field: 'individuals', name: 'Individuals' },
    { field: 'supervisor', name: 'Supervisor' },
    { field: 'location', name: 'Location' }
  ];

  requiredFields.forEach(({ field, name }) => {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
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
 * Helper function to determine risk assessment status based on risks
 */
const determineRiskAssessmentStatus = (risks, requestedStatus = 'Pending') => {
  // If any risk requires supervisor signature, status must be 'Pending'
  const requiresSignature = risks.some(risk => risk.requiresSupervisorSignature);
  return requiresSignature ? 'Pending' : requestedStatus;
};

/**
 * Helper function to format risk assessment for frontend response
 * Converts junction table associations to comma-separated email string
 */
const formatRiskAssessment = (riskAssessment) => {
  const formatted = {
    ...riskAssessment.get({ plain: true }),
    supervisor: riskAssessment.supervisor?.email || '',
  };
  
  // Get all individuals from the many-to-many association via junction table
  if (riskAssessment.individuals && riskAssessment.individuals.length > 0) {
    formatted.individuals = riskAssessment.individuals.map(user => user.email).join(', ');
  } else {
    formatted.individuals = ''; // No individuals assigned
  }
  
  return formatted;
};

/**
 * Helper function to update risk assessment risks
 * Handles create, update, and delete operations for associated risks
 */
const updateRiskAssessmentRisks = async (riskAssessment, newRisks, transaction) => {
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
  if (riskAssessment.risks && riskAssessment.risks.length > 0) {
    await Promise.all(riskAssessment.risks.map(async risk => {
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
    await riskAssessment.createRisk(processedRisk, { transaction });
  }));

  return processedRisks;
};

/**
 * Helper function to find risk assessment with company validation
 */
const findRiskAssessmentByIdAndCompany = async (id, companyId, includeAssociations = true) => {
  const whereClause = { id, companyId };
  const options = { where: whereClause };
  
  // Only include associations if needed (optimization for queries that don't need them)
  if (includeAssociations) {
    // Let the default scope handle associations
  }
  
  const riskAssessment = await RiskAssessment.findOne(options);
  
  if (!riskAssessment) {
    throw new Error("Risk Assessment not found");
  }
  
  return riskAssessment;
};

/**
 * Create and Save a new Risk Assessment
 * Handles all individuals through the junction table (many-to-many relationship)
 */
exports.create = async (req, res) => {
  console.log("STARTED: Risk Assessment creation");
  let transaction;
  
  try {
    // Start transaction early for consistency
    transaction = await db.sequelize.transaction();
    
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    // Validate required fields
    const missingFields = validateRequiredFields(req.body);
    if (missingFields.length > 0) {
      console.log("Missing fields", missingFields);
      console.log("Received fields", Object.keys(req.body));
      await transaction.rollback();
      return res.status(400).json(createErrorResponse(
        "validation_error",
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
      individuals = await parseAndValidateIndividuals(req.body.individuals, transaction);
      supervisor = await findAndValidateSupervisor(req.body.supervisor, transaction);
    } catch (validationError) {
      await transaction.rollback();
      return res.status(404).json(createErrorResponse("validation_error", validationError.message));
    }

    // Process risks and determine status
    const processedRisks = processRisks(req.body.risks);
    const status = determineRiskAssessmentStatus(processedRisks, req.body.status);

    // Create Risk Assessment (using junction table for all individuals)
    const riskAssessment = await RiskAssessment.create({
      companyId: userCompanyId,
      date: req.body.date,
      time: req.body.time,
      scopeOfWork: req.body.scopeOfWork,
      assetHierarchyId: req.body.assetSystem,
      systemLockoutRequired: req.body.systemLockoutRequired || false,
      trainedWorkforce: req.body.trainedWorkforce,
      supervisorId: supervisor.id,
      location: req.body.location,
      status: status
    }, { transaction });

    // Associate all individuals through junction table
    await riskAssessment.addIndividuals(individuals, { transaction });

    // Create associated risks
    await Promise.all(processedRisks.map(async risk => {
      await riskAssessment.createRisk(risk, { transaction });
    }));
    
    // Commit transaction
    await transaction.commit();

    res.status(201).json(createSuccessResponse(
      "Risk Assessment created successfully",
      { riskAssessment, risks: processedRisks }
    ));

  } catch (error) {
    // Rollback transaction on any error
    if (transaction) await transaction.rollback();
    
    console.error('Error creating risk assessment:', error);
    res.status(500).json(createErrorResponse(
      "server_error",
      error.message || "Some error occurred while creating the Risk Assessment."
    ));
  }
};

/**
 * Retrieve all Risk Assessments from the database for the authenticated user's company
 * Uses optimized queries with proper association loading
 */
exports.findAll = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Fetch risk assessments with optimized query (default scope includes all needed associations)
    const riskAssessments = await RiskAssessment.findAll({
      where: { companyId: userCompanyId }
      // Default scope automatically includes: company, supervisor, individuals
    });

    // Format for frontend response
    const formattedRiskAssessments = riskAssessments.map(formatRiskAssessment);

    res.status(200).json(createSuccessResponse(
      "Risk Assessments retrieved successfully",
      formattedRiskAssessments
    ));
    
  } catch (error) {
    console.error('Error retrieving risk assessments:', error);
    res.status(500).json(createErrorResponse(
      "server_error",
      error.message || "Some error occurred while retrieving risk assessments."
    ));
  }
};

/**
 * Find a single Risk Assessment by ID with company validation
 * Returns formatted data including all associated individuals from junction table
 */
exports.findOne = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    
    // Find risk assessment with company validation
    const riskAssessment = await findRiskAssessmentByIdAndCompany(req.params.id, userCompanyId);

    // Format for frontend response
    const formattedRiskAssessment = formatRiskAssessment(riskAssessment);

    res.status(200).json(createSuccessResponse(
      "Risk Assessment retrieved successfully",
      formattedRiskAssessment
    ));
    
  } catch (error) {
    console.error('Error retrieving risk assessment:', error);
    
    if (error.message === "Risk Assessment not found") {
      return res.status(404).json(createErrorResponse("not_found", error.message));
    }
    
    res.status(500).json(createErrorResponse(
      "server_error",
      error.message || `Error retrieving Risk Assessment with id ${req.params.id}`
    ));
  }
};

/**
 * Update a Risk Assessment by ID
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
      return res.status(403).json(createErrorResponse("authorization_error", "Submitting user not found"));
    }

    // When a regular user makes changes to a risk assessment that required a supervisor signature, the assessment will be set back to pending
    // as reapproval is required. Except when changing the status to completed.
    const requiresSignature = req.body.risks.some(risk => risk.requiresSupervisorSignature);
    let status = req.body.status;
    if(requiresSignature && user.role === "user" && req.body.status !== "Completed"){
      status = determineRiskAssessmentStatus(req.body.risks, status);
    }

    // Find risk assessment with company validation (before starting transaction)
    const riskAssessment = await findRiskAssessmentByIdAndCompany(req.body.id, userCompanyId);

    // Validate individuals and supervisor (before transaction for better error handling)
    let individuals, supervisor;
    try {
      individuals = await parseAndValidateIndividuals(req.body.individuals);
      supervisor = await findAndValidateSupervisor(req.body.supervisor);
    } catch (validationError) {
      return res.status(404).json(createErrorResponse("validation_error", validationError.message));
    }

    // Start transaction for data modifications
    const result = await db.sequelize.transaction(async (transaction) => {
      // Update Risk Assessment main fields
      await riskAssessment.update({
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        assetHierarchyId: req.body.assetSystem || riskAssessment.assetHierarchyId,
        systemLockoutRequired: req.body.systemLockoutRequired,
        trainedWorkforce: req.body.trainedWorkforce,
        supervisorId: supervisor.id,
        location: req.body.location,
        status: status
      }, { transaction });

      // Update individuals association through junction table
      await riskAssessment.setIndividuals(individuals, { transaction });

      // Update associated risks if provided
      let updatedRisks = [];
      if (req.body.risks && Array.isArray(req.body.risks)) {
        updatedRisks = await updateRiskAssessmentRisks(riskAssessment, req.body.risks, transaction);
      }

      return { riskAssessment, risks: updatedRisks };
    });

    res.status(200).json(createSuccessResponse(
      "Risk Assessment updated successfully",
      result
    ));

  } catch (error) {
    console.error('Error updating risk assessment:', error);
    
    if (error.message === "Risk Assessment not found") {
      return res.status(404).json(createErrorResponse("not_found", error.message));
    }
    
    res.status(500).json(createErrorResponse(
      "server_error",
      error.message || "Some error occurred while updating the Risk Assessment."
    ));
  }
};

/**
 * Delete a Risk Assessment with the specified ID
 * Handles cascade deletion of junction table entries
 */
exports.delete = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);
    const id = req.params.id;
    
    // Find risk assessment with company validation
    const riskAssessment = await findRiskAssessmentByIdAndCompany(id, userCompanyId, false);

    // Delete within transaction for data consistency
    await db.sequelize.transaction(async (transaction) => {
      // Delete associated risks (foreign key constraint requires this first)
      await RiskAssessmentRisk.destroy({
        where: { riskAssessmentId: id },
        transaction
      });

      // Delete the risk assessment (junction table entries will be cascade deleted)
      await riskAssessment.destroy({ transaction });
    });

    res.status(200).json(createSuccessResponse("Risk Assessment deleted successfully"));

  } catch (error) {
    console.error('Error deleting risk assessment:', error);
    
    if (error.message === "Risk Assessment not found") {
      return res.status(404).json(createErrorResponse("not_found", error.message));
    }
    
    res.status(500).json(createErrorResponse(
      "server_error",
      error.message || "Some error occurred while deleting the Risk Assessment."
    ));
  }
}; 