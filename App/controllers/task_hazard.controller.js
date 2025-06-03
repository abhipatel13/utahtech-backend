const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const AssetHierarchy = db.asset_hierarchy;
const { Op } = require("sequelize");

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

// Function to generate the next task ID with locking to prevent duplicates
const generateNextTaskId = async (transaction) => {
  try {
    // Get the latest task hazard with a lock to prevent concurrent access
    const latestTask = await TaskHazard.findOne({
      order: [['id', 'DESC']],
      lock: true,
      transaction
    });

    if (!latestTask) {
      return 'TZ1'; // First task ID
    }

    // Extract the number from the latest ID (e.g., 'TZ1' -> 1)
    const lastNumber = parseInt(latestTask.id.replace('TZ', ''));
    
    // Verify the generated ID doesn't exist
    const nextId = `TZ${lastNumber + 1}`;
    const existingTask = await TaskHazard.findByPk(nextId, { transaction });
    
    if (existingTask) {
      // If ID exists, find the next available number
      const allTasks = await TaskHazard.findAll({
        attributes: ['id'],
        order: [['id', 'ASC']],
        transaction
      });
      
      const usedNumbers = new Set(
        allTasks.map(task => parseInt(task.id.replace('TZ', '')))
      );
      
      let nextNumber = 1;
      while (usedNumbers.has(nextNumber)) {
        nextNumber++;
      }
      
      return `TZ${nextNumber}`;
    }
    
    return nextId;
  } catch (error) {
    console.error('Error generating task ID:', error);
    throw new Error('Failed to generate task ID');
  }
};

// Create and Save a new Task Hazard
exports.create = async (req, res) => {
  let transaction;
  
  try {
    // Start transaction
    transaction = await db.sequelize.transaction();
    
    // Generate task ID within the transaction
    const taskId = await generateNextTaskId(transaction);

    // Get company from the authenticated user
    const userCompany = req.user.company;
    if (!userCompany) {
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

    // Check if asset system exists
    const assetSystem = await AssetHierarchy.findOne({
      where: {
        [Op.or]: [
          { id: req.body.assetSystem },
          { name: req.body.assetSystem }
        ]
      }
    });

    if (!assetSystem) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Asset system not found",
        details: {
          searchedValue: req.body.assetSystem,
          availableAssets: await AssetHierarchy.findAll({
            attributes: ['id', 'name'],
            limit: 5
          })
        }
      });
    }

    // Create Task Hazard
    const taskHazard = await TaskHazard.create({
      id: taskId,
      company: userCompany,
      date: req.body.date,
      time: req.body.time,
      scopeOfWork: req.body.scopeOfWork,
      assetSystem: req.body.assetSystem,
      systemLockoutRequired: req.body.systemLockoutRequired || false,
      trainedWorkforce: req.body.trainedWorkforce,
      individual: req.body.individual,
      supervisor: req.body.supervisor,
      location: req.body.location,
      status: req.body.status || 'Pending',
      geoFenceLimit: req.body.geoFenceLimit || 200
    }, { transaction });

    // Create associated risks
    const risks = await Promise.all(
      req.body.risks.map(risk => 
        TaskRisk.create({
          taskHazardId: taskHazard.id,
          riskDescription: risk.riskDescription,
          riskType: risk.riskType,
          asIsLikelihood: convertToInteger(risk.asIsLikelihood),
          asIsConsequence: convertToInteger(risk.asIsConsequence),
          mitigatingAction: risk.mitigatingAction,
          mitigatingActionType: risk.mitigatingActionType,
          mitigatedLikelihood: convertToInteger(risk.mitigatedLikelihood),
          mitigatedConsequence: convertToInteger(risk.mitigatedConsequence),
          requiresSupervisorSignature: risk.requiresSupervisorSignature || false
        }, { transaction })
      )
    );

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

// Retrieve all Task Hazards from the database
exports.findAll = async (req, res) => {
  try {
    // Get company from the authenticated user
    const userCompany = req.user.company;

    const taskHazards = await TaskHazard.findAll({
      where: {
        company: userCompany
      },
      include: [{
        model: TaskRisk,
        as: 'risks'
      }]
    });
    
    res.status(200).json({
      status: true,
      data: taskHazards
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
    const userCompany = req.user.company;

    const taskHazard = await TaskHazard.findOne({
      where: {
        id: req.params.id,
        company: userCompany
      },
      include: [{
        model: TaskRisk,
        as: 'risks'
      }]
    });

    if (!taskHazard) {
      return res.status(404).json({
        status: false,
        message: "Task Hazard not found"
      });
    }

    res.status(200).json({
      status: true,
      data: taskHazard
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
    const id = req.params.id;
    
    // Get company from the authenticated user
    const userCompany = req.user.company;

    // Check if task hazard exists and belongs to the user's company
    const taskHazard = await TaskHazard.findOne({
      where: {
        id: id,
        company: userCompany
      }
    });

    if (!taskHazard) {
      return res.status(404).json({
        status: false,
        message: "Task Hazard not found"
      });
    }

    // If asset system is being updated, verify it exists
    if (req.body.assetSystem) {
      const assetSystem = await AssetHierarchy.findOne({
        where: {
          [Op.or]: [
            { id: req.body.assetSystem },
            { name: req.body.assetSystem }
          ]
        }
      });

      if (!assetSystem) {
        return res.status(404).json({
          status: false,
          message: "Asset system not found",
          details: {
            searchedValue: req.body.assetSystem,
            availableAssets: await AssetHierarchy.findAll({
              attributes: ['id', 'name'],
              limit: 5
            })
          }
        });
      }
    }

    // Start transaction'
    console.log("req.body.risks", req.body);
    const result = await db.sequelize.transaction(async (t) => {
      // Update Task Hazard
      await taskHazard.update({
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        assetSystem: req.body.assetSystem || taskHazard.assetSystem,
        systemLockoutRequired: req.body.systemLockoutRequired,
        trainedWorkforce: req.body.trainedWorkforce,
        individual: req.body.individual,
        supervisor: req.body.supervisor,
        location: req.body.location,
        status: req.body.status,
        geoFenceLimit: req.body.geoFenceLimit
      }, { transaction: t });

      // Update associated risks if provided
      if (req.body.risks && Array.isArray(req.body.risks)) {
        // Delete existing risks
        await TaskRisk.destroy({
          where: { taskHazardId: id },
          transaction: t
        });

        // Create new risks
        const risks = await Promise.all(
          req.body.risks.map(risk => 
            TaskRisk.create({
              taskHazardId: id,
              riskDescription: risk.riskDescription,
              riskType: risk.riskType,
              asIsLikelihood: convertToInteger(risk.asIsLikelihood),
              asIsConsequence: convertToInteger(risk.asIsConsequence),
              mitigatingAction: risk.mitigatingAction,
              mitigatingActionType: risk.mitigatingActionType,
              mitigatedLikelihood: convertToInteger(risk.mitigatedLikelihood),
              mitigatedConsequence: convertToInteger(risk.mitigatedConsequence),
              requiresSupervisorSignature: risk.requiresSupervisorSignature || false
            }, { transaction: t })
          )
        );

        return { taskHazard, risks };
      }

      return { taskHazard };
    });

    res.status(200).json({
      status: true,
      message: "Task Hazard updated successfully",
      data: result
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while updating the Task Hazard."
    });
  }
};

// Delete a Task Hazard with the specified id in the request
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;
    
    // Get company from the authenticated user
    const userCompany = req.user.company;
    
    // Check if task hazard exists and belongs to the user's company
    const taskHazard = await TaskHazard.findOne({
      where: {
        id: id,
        company: userCompany
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