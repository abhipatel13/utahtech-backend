const { Sequelize } = require('sequelize');

class AssetHierarchy extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: Sequelize.STRING,  // CMMS Internal ID + timestamp
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
      name: {
        type: Sequelize.STRING,  // Functional Location Description
        allowNull: false
      },
      cmms_internal_id: {
        type: Sequelize.STRING,  // CMMS Internal ID
        field: 'cmms_internal_id',
        allowNull: false
      },
      functional_location: {
        type: Sequelize.STRING,  // Functional Location
        allowNull: false
      },
      functional_location_desc: {
        type: Sequelize.STRING,  // Functional Location Description
        allowNull: false
      },
      functional_location_long_desc: {
        type: Sequelize.TEXT,    // Functional Location Long Description
        allowNull: true
      },
      parent_id: {
        type: Sequelize.STRING,  // Parent Functional Location
        allowNull: true,
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
      },
      maintenance_plant: {
        type: Sequelize.STRING,  // Maintenance Plant
        field: 'maintenance_plant',
        allowNull: true
      },
      cmms_system: {
        type: Sequelize.STRING,  // CMMS System
        field: 'cmms_system',
        allowNull: true
      },
      object_type: {
        type: Sequelize.STRING,  // Object Type (Taxonomy Mapping Value)
        field: 'object_type',
        allowNull: true
      },
      system_status: {
        type: Sequelize.STRING,  // System Status
        field: 'system_status',
        defaultValue: 'Active',
        allowNull: true
      },
      make: {
        type: Sequelize.STRING,
        allowNull: true
      },
      manufacturer: {
        type: Sequelize.STRING,
        allowNull: true
      },
      serial_number: {
        type: Sequelize.STRING,
        field: 'serial_number',
        allowNull: true
      },
      level: {
        type: Sequelize.INTEGER,
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
      as: 'child'
    })

    this.belongsTo(models.asset_hierarchy, {
      foreignKey: 'parent_id',
      as: 'parent'
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
