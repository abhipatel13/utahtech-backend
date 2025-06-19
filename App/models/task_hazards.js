module.exports = (sequelize, Sequelize) => {
  const TaskHazard = sequelize.define("task_hazards", {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
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
    scope_of_work: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    asset_hierarchy_id: {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: 'asset_hierarchy',
        key: 'id'
      }
    },
    system_lockout_required: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    trained_workforce: {
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
    geofence_limit: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 200
    }
  }, {
    tableName: 'task_hazards',
    timestamps: true,
    underscored: true

  });

  // Define the association
  TaskHazard.associate = function(models) {
    TaskHazard.belongsTo(models.asset_hierarchy, {
      foreignKey: 'asset_hierarchy_id',
      as: 'asset'
    });

    TaskHazard.belongsTo(models.company, {  
      foreignKey: "company_id",
      as: 'company'
    });

    TaskHazard.hasMany(models.task_risks,{ 
      foreignKey: 'taskHazard_id', 
      as: 'risks' 
    });
  };

  return TaskHazard;
}; 