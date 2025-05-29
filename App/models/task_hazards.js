module.exports = (sequelize, Sequelize) => {
  const TaskHazard = sequelize.define("task_hazards", {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false
    },
    company: {
      type: Sequelize.STRING(150),
      allowNull: false,
      references: {
        model: 'users',
        key: 'company'
      }
    },
    date: {
      type: Sequelize.DATEONLY,
      allowNull: false
    },
    time: {
      type: Sequelize.TIME,
      allowNull: false
    },
    scopeOfWork: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    assetSystem: {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: 'asset_hierarchy',
        key: 'id'
      }
    },
    systemLockoutRequired: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    trainedWorkforce: {
      type: Sequelize.STRING,
      allowNull: false
    },
    individual: {
      type: Sequelize.STRING,
      allowNull: false
    },
    
    supervisor: {
      type: Sequelize.STRING,
      allowNull: false
    },
    location: {
      type: Sequelize.STRING,
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM('Active', 'Inactive', 'Completed', 'Pending', 'Rejected'),
      defaultValue: 'Pending'
    },
    geoFenceLimit: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 200
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
  TaskHazard.associate = function(models) {
    // A TaskHazard has many TaskRisks
    TaskHazard.hasMany(models.task_risks, {
      foreignKey: 'taskHazardId',
      as: 'risks'
    });
    
    // A TaskHazard belongs to an AssetHierarchy
    TaskHazard.belongsTo(models.asset_hierarchy, {
      foreignKey: 'assetSystem',
      as: 'asset'
    });
  };

  return TaskHazard;
}; 