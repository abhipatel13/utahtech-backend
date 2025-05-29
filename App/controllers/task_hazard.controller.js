const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const AssetHierarchy = db.asset_hierarchy;
const { Op } = require("sequelize");

// Function to generate the next task ID
const generateNextTaskId = async () => {
  try {
    // Get the latest task hazard
    const latestTask = await TaskHazard.findOne({
      order: [['id', 'DESC']]
    });

    if (!latestTask) {
      return 'TZ1'; // First task ID
    }

    // Extract the number from the latest ID (e.g., 'TZ1' -> 1)
    const lastNumber = parseInt(latestTask.id.replace('TZ', ''));
    return `TZ${lastNumber + 1}`;
  } catch (error) {
    console.error('Error generating task ID:', error);
    throw new Error('Failed to generate task ID');
  }
};

// Create and Save a new Task Hazard
exports.create = async (req, res) => {
  try {
    // Generate task ID
    const taskId = await generateNextTaskId();

    // Get company from the authenticated user
    const userCompany = req.user.company;
    if (!userCompany) {
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

    console.log('Missing fields:', req.body.risks);

    // Check if risks array exists and is not empty
    if (!req.body.risks || !Array.isArray(req.body.risks) || req.body.risks.length === 0) {
      missingFields.push('Risks (at least one risk is required)');
    }

    // If there are missing fields, return detailed error
    if (missingFields.length > 0) {
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
    try {
      const assetSystem = await AssetHierarchy.findOne({
        where: {
          [Op.or]: [
            { id: req.body.assetSystem },
            { name: req.body.assetSystem }
          ]
        }
      });
      console.log('Asset system:', req.body.assetSystem, assetSystem);

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
      console.log('Asset system found:', assetSystem);
    } catch (error) {
      console.error('Error checking asset system:', error);
      return res.status(500).json({
        status: false,
        message: "Error checking asset system",
        details: error.message
      });
    }

    // Helper function to convert likelihood and consequence strings to integers
    const convertToInteger = (value) => {
      console.log("Converting value:", value);

      if (value === undefined || value === null || value === "") {
        console.log("Empty value, returning default 1");
        return 1; // Default value for empty inputs
      }
      
      // Maps for create function
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
        console.log("Value is already a number:", Number(value));
        return Number(value);
      }
      
      // Check if value is in our maps
      if (likelihoodMap[value] !== undefined) {
        console.log("Found in likelihood map:", likelihoodMap[value]);
        return likelihoodMap[value];
      }
      
      if (consequenceMap[value] !== undefined) {
        console.log("Found in consequence map:", consequenceMap[value]);
        return consequenceMap[value];
      }

      // If we get here, we couldn't convert properly
      console.log("Could not convert value, using default 1");
      return 1; // Default fallback
    };

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Create Task Hazard
      console.log("This is the assetSystem", req.body);
      
      const taskHazard = await TaskHazard.create({
        id: taskId,
        company: userCompany,
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        systemLockoutRequired: req.body.systemLockoutRequired || false,
        trainedWorkforce: req.body.trainedWorkforce,
        individual: req.body.individual,
        supervisor: req.body.supervisor,
        location: req.body.location,
        status: req.body.status || 'Active',
        geoFenceLimit: req.body.geoFenceLimit || 200
      }, { transaction: t });
      console.log(taskHazard);
      
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
          }, { transaction: t })
        )
      );
      console.log("risks", risks);

      return { taskHazard, risks };
    });

    console.log(result);

    res.status(201).json({
      status: true,
      message: "Task Hazard created successfully",
      data: result
    });

  } catch (error) {
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

    // Helper function to convert likelihood and consequence strings to integers
    const convertToInteger = (value) => {
      console.log("Converting value:", value);

      if (value === undefined || value === null || value === "") {
        console.log("Empty value, returning default 1");
        return 1; // Default value for empty inputs
      }
      
      // Maps for update function
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
        console.log("Value is already a number:", Number(value));
        return Number(value);
      }
      
      // Check if value is in our maps
      if (likelihoodMap[value] !== undefined) {
        console.log("Found in likelihood map:", likelihoodMap[value]);
        return likelihoodMap[value];
      }
      
      if (consequenceMap[value] !== undefined) {
        console.log("Found in consequence map:", consequenceMap[value]);
        return consequenceMap[value];
      }

      // If we get here, we couldn't convert properly
      console.log("Could not convert value, using default 1");
      return 1; // Default fallback
    };

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Update Task Hazard
      console.log("req.body", req.body);
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
        console.log("req.body.risks", req.body.risks);
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

        console.log("risks", risks);

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