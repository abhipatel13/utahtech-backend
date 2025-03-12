const db = require("../models");
const TaskHazard = db.task_hazards;
const TaskRisk = db.task_risks;
const AssetHierarchy = db.asset_heirarchies;

// Create and Save a new Task Hazard
exports.create = async (req, res) => {
  try {
    // Validate request
    console.log(req.body);
    if (!req.body.id || !req.body.date || !req.body.time || !req.body.scopeOfWork || 
        !req.body.trainedWorkforce || !req.body.individual || 
        !req.body.supervisor || !req.body.location || !req.body.risks || !Array.isArray(req.body.risks)) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields"
      });
    }

    // Check if asset system exists
    // const assetSystem = await AssetHierarchy.findByPk(req.body.assetSystem);
    // if (!assetSystem) {
    //   return res.status(404).json({
    //     status: false,
    //     message: "Asset system not found"
    //   });
    // }
    // console.log(assetSystem);

    // Helper function to convert likelihood and consequence strings to integers
    const convertToInteger = (value) => {
      const likelihoodMap = {
        'Very Unlikely': 1,
        'Unlikely': 2,
        'Possible': 3,
        'Likely': 4,
        'Very Likely': 5
      };
      
      const consequenceMap = {
        'Negligible': 1,
        'Minor': 2,
        'Moderate': 3,
        'Significant': 4,
        'Serious': 5
      };
      
      return likelihoodMap[value] || consequenceMap[value] || 1; // Default to 1 if not found
    };

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Create Task Hazard
      console.log("This is the assetSystem", req.body);
      
      const taskHazard = await TaskHazard.create({
        id: req.body.id,
        date: req.body.date,
        time: req.body.time,
        scopeOfWork: req.body.scopeOfWork,
        systemLockoutRequired: req.body.systemLockoutRequired || false,
        trainedWorkforce: req.body.trainedWorkforce,
        individual: req.body.individual,
        supervisor: req.body.supervisor,
        location: req.body.location,
        status: req.body.status || 'Active'
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
    const taskHazards = await TaskHazard.findAll({
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
    const taskHazard = await TaskHazard.findByPk(req.params.id, {
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