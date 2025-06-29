const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const User = db.user;

// Helper function to convert likelihood and consequence strings to integers
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

// Create and Save a new Task Hazard
exports.create = async (req, res) => {
  console.log("STARTED: create");
  let transaction;
  
  try {
    // Start transaction
    transaction = await db.sequelize.transaction();
    
    // Get company from the authenticated user
    const userCompanyId = req.user.company.id;
    if (!userCompanyId) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "User's company information is missing"
      });
    }

    // Check each required field and collect missing fields
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
      if (!req.body[field]) {
        missingFields.push(name);
      }
    });

    // Check if risks array exists and is not empty
    if (!req.body.risks || !Array.isArray(req.body.risks) || req.body.risks.length === 0) {
      missingFields.push('Risks (at least one risk is required)');
    }

    // If there are missing fields, return detailed error
    if (missingFields.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "Missing required fields",
        details: {
          missingFields: missingFields,
          receivedFields: Object.keys(req.body)
        }
      });
    }

    // Get individuals and supervisor ids
    const individual = await User.findOne({
      where: {
        email: req.body.individual
      }
    }, { transaction });

    if (!individual) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Individual not found"
      });
    }
    
    const supervisor = await User.findOne({
      where: {
        email: req.body.supervisor
      },
    }, { transaction });

    if (!supervisor) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Supervisor not found"
      });
    }

    const risks = req.body.risks.map((risk) => {
        return ({
          riskDescription: risk.riskDescription,
          riskType: risk.riskType,
          asIsLikelihood: convertToInteger(risk.asIsLikelihood),
          asIsConsequence: convertToInteger(risk.asIsConsequence),
          mitigatingAction: risk.mitigatingAction,
          mitigatingActionType: risk.mitigatingActionType,
          mitigatedLikelihood: convertToInteger(risk.mitigatedLikelihood),
          mitigatedConsequence: convertToInteger(risk.mitigatedConsequence),
          requiresSupervisorSignature: risk.requiresSupervisorSignature || false
        })
      }
    );

    // Create Task Hazard
    const taskHazard = await TaskHazard.create({
      companyId: userCompanyId,
      date: req.body.date,
      time: req.body.time,
      scopeOfWork: req.body.scopeOfWork,
      assetHierarchyId: req.body.assetSystem,
      systemLockoutRequired: req.body.systemLockoutRequired || false,
      trainedWorkforce: req.body.trainedWorkforce,
      individualId: individual.id,
      supervisorId: supervisor.id,
      location: req.body.location,
      status: req.body.status || 'Pending',
      geoFenceLimit: req.body.geoFenceLimit || 200
    }, { transaction });

    // Create associated risks
    await Promise.all(risks.map(async risk => {
      await taskHazard.createRisk(risk, { transaction });
    }));
    
    // Commit transaction
    await transaction.commit();

    res.status(201).json({
      status: true,
      message: "Task Hazard created successfully",
      data: { taskHazard, risks }
    });

  } catch (error) {
    // Rollback transaction on error
    if (transaction) await transaction.rollback();
    
    console.error('Error creating task hazard:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while creating the Task Hazard."
    });
  }
};

// A helper function to format a task hazard based on the frontend requirements
const formatTaskHazard = (taskHazard) => {
  return {
    ...taskHazard.get({ plain: true }),
    supervisor: taskHazard.supervisor.email,
    individual: taskHazard.individual.email
  };
};

// Retrieve all Task Hazards from the database
exports.findAll = async (req, res) => {
  try {
    // Get company from the authenticated user
    const userCompanyId = req.user.company.id;
    const taskHazards = await TaskHazard.findAll({
      where: {
        companyId: userCompanyId
      }
    });

    const formattedTaskHazards = taskHazards.map(taskHazard => {
      return formatTaskHazard(taskHazard);
    });

    res.status(200).json({
      status: true,
      data: formattedTaskHazards
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while retrieving task hazards."
    });
  }
};

// Find a single Task Hazard with an id
exports.findOne = async (req, res) => {
  try {
    // Get company from the authenticated user
    const userCompanyId = req.user.company.id;
    const taskHazard = await TaskHazard.findOne({
      where: {
        id: req.params.id,
        companyId: userCompanyId
      }
    });

    if (!taskHazard) {
      return res.status(404).json({
        status: false,
        message: "Task Hazard not found"
      });
    }

    const formattedTaskHazard = formatTaskHazard(taskHazard);

    res.status(200).json({
      status: true,
      data: formattedTaskHazard
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Error retrieving Task Hazard with id " + req.params.id
    });
  }
};

// Update a Task Hazard by the id in the request
exports.update = async (req, res) => {
  try {
    // Check if task hazard exists and belongs to the user's company
    const userCompanyId = req.user.company.id;
    const taskHazard = await TaskHazard.findOne({
      where: {
        id: req.body.id,
        companyId: userCompanyId
      }
    });

    if (!taskHazard) {
      return res.status(404).json({
        status: false,
        message: "Task Hazard not found"
      });
    }

    // Get individuals and supervisor ids
    const individual = await User.findOne({
      where: {
        email: req.body.individual
      }
    });

    if (!individual) {
      return res.status(404).json({
        status: false,
        message: "Individual not found"
      });
    }
    
    const supervisor = await User.findOne({
      where: {
        email: req.body.supervisor
      },
    });

    if (!supervisor) {
      return res.status(404).json({
        status: false,
        message: "Supervisor not found"
      });
    }

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Update Task Hazard
      await taskHazard.update({
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        assetHierarchyId: req.body.assetSystem || taskHazard.assetHierarchyId,
        systemLockoutRequired: req.body.systemLockoutRequired,
        trainedWorkforce: req.body.trainedWorkforce,
        individualId: individual.id,
        supervisorId: supervisor.id,
        location: req.body.location,
        status: req.body.status,
        geoFenceLimit: req.body.geoFenceLimit
      }, { transaction: t });

      // Update associated risks if provided
      if (req.body.risks && Array.isArray(req.body.risks)) {
        const riskMap = new Map();
        req.body.risks.forEach(risk => {
          riskMap.set(risk.id, risk);
        });

        // Update or delete existing risks
        await Promise.all(taskHazard.risks.map(async risk => {
          if(riskMap.has(risk.id)){
            const updatedRisk = riskMap.get(risk.id);
            await risk.update({
              riskDescription: updatedRisk.riskDescription,
              riskType: updatedRisk.riskType,
              asIsLikelihood: convertToInteger(updatedRisk.asIsLikelihood),
              asIsConsequence: convertToInteger(updatedRisk.asIsConsequence),
              mitigatingAction: updatedRisk.mitigatingAction,
              mitigatingActionType: updatedRisk.mitigatingActionType,
              mitigatedLikelihood: convertToInteger(updatedRisk.mitigatedLikelihood),
              mitigatedConsequence: convertToInteger(updatedRisk.mitigatedConsequence),
              requiresSupervisorSignature: updatedRisk.requiresSupervisorSignature || risk.requiresSupervisorSignature
            }, { transaction: t });
            riskMap.delete(risk.id);
          } else {
            await risk.destroy({ transaction: t });
          }
        }));

        // Create new risks - Fixed: use map instead of forEach
        await Promise.all(Array.from(riskMap.values()).map(async risk => {
          await taskHazard.createRisk({
            riskDescription: risk.riskDescription,
            riskType: risk.riskType,
            asIsLikelihood: convertToInteger(risk.asIsLikelihood),
            asIsConsequence: convertToInteger(risk.asIsConsequence),
            mitigatingAction: risk.mitigatingAction,
            mitigatingActionType: risk.mitigatingActionType,
            mitigatedLikelihood: convertToInteger(risk.mitigatedLikelihood),
            mitigatedConsequence: convertToInteger(risk.mitigatedConsequence),
            requiresSupervisorSignature: risk.requiresSupervisorSignature || false
          }, { transaction: t });
        }));

        return { taskHazard, risks: req.body.risks };
      }

      return { taskHazard };
    });

    res.status(200).json({
      status: true,
      message: "Task Hazard updated successfully",
      data: result
    });

  } catch (error) {
    console.error('Error updating task hazard:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while updating the Task Hazard."
    });
  }
};

// Delete a Task Hazard with the specified id in the request
exports.delete = async (req, res) => {
  try {
    // Get company from the authenticated user
    const userCompanyId = req.user.company.id;
    const id = req.params.id;
    
    // Check if task hazard exists and belongs to the user's company
    const taskHazard = await TaskHazard.findOne({
      where: {
        id: id,
        companyId: userCompanyId
      }
    });

    if (!taskHazard) {
      return res.status(404).json({
        status: false,
        message: "Task Hazard not found"
      });
    }

    // Start transaction
    await db.sequelize.transaction(async (t) => {
      // Delete associated risks first (due to foreign key constraint)
      await TaskRisk.destroy({
        where: { taskHazardId: id },
        transaction: t
      });

      // Delete the task hazard
      await taskHazard.destroy({ transaction: t });
    });

    res.status(200).json({
      status: true,
      message: "Task Hazard deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while deleting the Task Hazard."
    });
  }
}; 