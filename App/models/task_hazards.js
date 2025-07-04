const { Sequelize } = require('sequelize');

class TaskHazard extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'id'
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'company_id',
        references: {
          model: 'company',
          key: 'id'
        }
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'date'
      },
      time: {
        type: DataTypes.TIME,
        allowNull: false,
        field: 'time'
      },
      scopeOfWork: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'scope_of_work'
      },
      assetHierarchyId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'asset_hierarchy_id',
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
      },
      systemLockoutRequired: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'system_lockout_required'
      },
      trainedWorkforce: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'trained_workforce'
      },
      supervisorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'supervisor_id'
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'location'
      },
      status: {
        type: DataTypes.ENUM('Active', 'Inactive', 'Completed', 'Pending', 'Rejected'),
        defaultValue: 'Pending',
        field: 'status'
      },
      geofenceLimit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 200,
        field: 'geofence_limit'
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
    this.belongsTo(models.asset_hierarchy, {
      foreignKey: 'assetHierarchyId',
      as: 'asset'
    });

    this.belongsTo(models.company, {  
      foreignKey: "companyId",
      as: 'company'
    });

    this.hasMany(models.task_risks,{ 
      foreignKey: 'taskHazardId', 
      as: 'risks' 
    });

    this.belongsTo(models.user, {
      foreignKey: 'supervisorId',
      as: 'supervisor'
    });

    // Many-to-many relationship with users for multiple individuals
    this.belongsToMany(models.user, {
      through: models.task_hazard_individuals,
      foreignKey: 'taskHazardId',
      otherKey: 'userId',
      as: 'individuals'
    });
  };

  static scopes(models) {
    this.addScope('defaultScope', {
      include: [
        { model: models.company, 
          as: 'company', 
          attributes: ['id', 'name'] },
        { model: models.task_risks, as: 'risks' },
        { model: models.user, as: 'supervisor' },
        { model: models.user, as: 'individuals', attributes: ['id', 'email', 'name'] },
      ],
      attributes: [
        'id', 
        'date', 
        'time', 
        'scopeOfWork', 
        ['asset_hierarchy_id', 'assetSystem'], 
        'systemLockoutRequired', 
        'trainedWorkforce', 
        'location', 
        'status', 
        'geofenceLimit'
      ],
    });
  }
}

module.exports = TaskHazard;