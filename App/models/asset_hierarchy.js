const { Sequelize } = require('sequelize');

class AssetHierarchy extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: Sequelize.STRING,  // CMMS Internal ID + timestamp
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: Sequelize.INTEGER,
        field: 'company_id',
        allowNull: false,
        references: {
          model: 'company',
          key: 'id'
        }
      },
      name: {
        type: Sequelize.STRING,  // Functional Location Description
        field: 'name',
        allowNull: false
      },
      cmmsInternalId: {
        type: Sequelize.STRING,  // CMMS Internal ID
        field: 'cmms_internal_id',
        allowNull: false
      },
      functionalLocation: {
        type: Sequelize.STRING,  // Functional Location
        field: 'functional_location',
        allowNull: false
      },
      functionalLocationDesc: {
        type: Sequelize.STRING,  // Functional Location Description
        field: 'functional_location_desc',
        allowNull: false
      },
      functionalLocationLongDesc: {
        type: Sequelize.TEXT,    // Functional Location Long Description
        field: 'functional_location_long_desc',
        allowNull: true
      },
      parent: {
        type: Sequelize.STRING,  // Parent Functional Location
        field: 'parent_id',
        allowNull: true,
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
      },
      maintenancePlant: {
        type: Sequelize.STRING,  // Maintenance Plant
        field: 'maintenance_plant',
        allowNull: true
      },
      cmmsSystem: {
        type: Sequelize.STRING,  // CMMS System
        field: 'cmms_system',
        allowNull: true
      },
      objectType: {
        type: Sequelize.STRING,  // Object Type (Taxonomy Mapping Value)
        field: 'object_type',
        allowNull: true
      },
      systemStatus: {
        type: Sequelize.STRING,  // System Status
        field: 'system_status',
        defaultValue: 'Active',
        allowNull: true
      },
      make: {
        type: Sequelize.STRING,
        field: 'make',
        allowNull: true
      },
      manufacturer: {
        type: Sequelize.STRING,
        field: 'manufacturer',
        allowNull: true
      },
      serialNumber: {
        type: Sequelize.STRING,
        field: 'serial_number',
        allowNull: true
      },
      level: {
        type: Sequelize.INTEGER,
        field: 'level',
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      sequelize,
      modelName: 'asset_hierarchy',
      tableName: 'asset_hierarchy',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  };

  static associate(models) {
    this.hasMany(models.asset_hierarchy, {
      foreignKey: 'parent_id',
      as: 'childId'
    })

    this.belongsTo(models.asset_hierarchy, {
      foreignKey: 'parent_id',
      as: 'parentId'
    });
    
    this.belongsTo(models.company, { 
      foreignKey: 'company_id',
      as: 'company'
    });

    this.hasMany(models.task_hazards, { 
      foreignKey: 'asset_hierarchy_id',
      as: 'taskHazards'
    });
  };
}

module.exports = AssetHierarchy;
