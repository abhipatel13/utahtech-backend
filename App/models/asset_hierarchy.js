module.exports = (sequelize, Sequelize) => {
  const AssetHierarchy = sequelize.define("asset_hierarchy", {
    id: {
      type: Sequelize.STRING,  // Functional Location
      primaryKey: true,
      allowNull: false
    },
    internalId: {
      type: Sequelize.STRING,  // CMMS Internal ID
      field: 'internal_id',
      allowNull: true
    },
    name: {
      type: Sequelize.STRING,  // Functional Location Description
      allowNull: false
    },
    description: {
      type: Sequelize.TEXT,    // Functional Location Long Description
      allowNull: true
    },
    parent: {
      type: Sequelize.STRING,  // Parent Functional Location
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
    primaryKey: {
      type: Sequelize.STRING,  // Primary Key
      field: 'primary_key',
      allowNull: true
    },
    cmmsSystem: {
      type: Sequelize.STRING,  // CMMS System
      field: 'cmms_system',
      allowNull: true
    },
    siteReference: {
      type: Sequelize.STRING,  // Site Reference Name
      field: 'site_reference',
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
      allowNull: true
    },
    manufacturer: {
      type: Sequelize.STRING,
      allowNull: true
    },
    serialNumber: {
      type: Sequelize.STRING,
      field: 'serial_number',
      allowNull: true
    },
    level: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
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
  }, {
    tableName: 'asset_hierarchy',
    timestamps: true,
    underscored: true
  });

  // Define self-referential association
  AssetHierarchy.associate = function(models) {
    AssetHierarchy.hasMany(models.asset_hierarchy, {
      foreignKey: 'parent',
      as: 'children'
    });
    
    AssetHierarchy.belongsTo(models.asset_hierarchy, {
      foreignKey: 'parent',
      as: 'parentAsset'
    });
  };

  return AssetHierarchy;
}; 