module.exports = (sequelize, Sequelize) => {
  const FailureMode = sequelize.define("failure_modes", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    failureMode: {
      type: Sequelize.STRING,
      allowNull: false
    },
    failureCause: {
      type: Sequelize.STRING,
      allowNull: false
    },
    failureEffect: {
      type: Sequelize.STRING,
      allowNull: false
    },
    step1FailureEvident: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      field: 'step1_failure_evident'
    },
    step2AffectsSafetyEnvironment: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      field: 'step2_affects_safety_environment'
    },
    step3SuitableTaskExists: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      field: 'step3_suitable_task_exists'
    },
    maintenanceStrategy: {
      type: Sequelize.STRING,
      allowNull: false
    },
    currentControls: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    recommendedActions: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    responsibility: {
      type: Sequelize.STRING,
      allowNull: true
    },
    activityName: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'activity_name'
    },
    activityDescription: {
      type: Sequelize.TEXT,
      allowNull: true,
      field: 'activity_description'
    },
    activityType: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'activity_type'
    },
    activityCause: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'activity_cause'
    },
    activitySource: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'activity_source'
    },
    tactic: {
      type: Sequelize.STRING,
      allowNull: true
    },
    shutdownType: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'shutdown_type'
    },
    department: {
      type: Sequelize.STRING,
      allowNull: true
    },
    frequency: {
      type: Sequelize.STRING,
      allowNull: true
    },
    documentNumber: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'document_number'
    },
    documentDescription: {
      type: Sequelize.TEXT,
      allowNull: true,
      field: 'document_description'
    },
    picture: {
      type: Sequelize.STRING,
      allowNull: true
    },
    resourceType: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'resource_type'
    },
    usageHours: {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'usage_hours'
    },
    assignedUnits: {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'assigned_units'
    },
    majorOverhaul: {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      field: 'major_overhaul'
    },
    otherShutdowns: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'other_shutdowns'
    },
    assetId: {
      type: Sequelize.STRING,
      allowNull: false,
      references: {
        model: 'asset_hierarchy',
        key: 'id'
      },
      field: 'asset_id'
    },
    createdAt: {
      field: 'created_at',
      type: Sequelize.DATE,
      allowNull: false
    },
    updatedAt: {
      field: 'updated_at',
      type: Sequelize.DATE,
      allowNull: false
    }
  });

  // Define the association
  FailureMode.associate = function(models) {
    // A FailureMode belongs to an AssetHierarchy
    FailureMode.belongsTo(models.asset_hierarchy, {
      foreignKey: 'assetId',
      as: 'asset'
    });
  };

  return FailureMode;
}; 