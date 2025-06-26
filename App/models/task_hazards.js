const { Sequelize } = require('sequelize');

class TaskHazard extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
      },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'company',
          key: 'id'
        }
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      time: {
        type: DataTypes.TIME,
        allowNull: false
      },
      scope_of_work: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      asset_hierarchy_id: {
        type: DataTypes.STRING,
        allowNull: true,
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
      },
      system_lockout_required: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      trained_workforce: {
        type: DataTypes.STRING,
        allowNull: false
      },
      individual: {
        type: DataTypes.STRING,
        allowNull: false
      },
      supervisor: {
        type: DataTypes.STRING,
        allowNull: false
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('Active', 'Inactive', 'Completed', 'Pending', 'Rejected'),
        defaultValue: 'Pending'
      },
      geofence_limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 200
      }
    }, {
      sequelize,
      modelName: 'task_hazards',
      tableName: 'task_hazards',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
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
  }
}

module.exports = TaskHazard;