module.exports = (sequelize, Sequelize) => {
  const AssetHierarchy = sequelize.define("asset_hierarchy", {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    description: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    parent: {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: 'asset_hierarchy',
        key: 'id'
      }
    },
    level: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    fmea: {
      type: Sequelize.STRING,
      allowNull: true
    },
    actions: {
      type: Sequelize.STRING,
      allowNull: true
    },
    criticalityAssessment: {
      type: Sequelize.STRING,
      allowNull: true
    },
    inspectionPoints: {
      type: Sequelize.STRING,
      allowNull: true
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