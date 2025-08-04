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
      description: {
        type: Sequelize.TEXT,    // Asset Description
        field: 'description',
        allowNull: true
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
      foreignKey: 'parent',
      as: 'children'
    })

    this.belongsTo(models.asset_hierarchy, {
      foreignKey: 'parent',
      as: 'parentId'
    });

    this.belongsTo(models.company, {
      foreignKey: 'companyId',
      as: 'company'
    });

    this.hasMany(models.task_hazards, {
      foreignKey: 'assetHierarchyId',
      as: 'taskHazards'
    });

    this.hasMany(models.risk_assessments, {
      foreignKey: 'assetHierarchyId',
      as: 'riskAssessments'
    });

    // Add hooks after associations are defined
    this.addHook('beforeDestroy', async (asset, options) => {
      const { transaction } = options;

      try {
        // 1. Recursively soft delete all child assets
        const childAssets = await models.asset_hierarchy.findAll({
          where: { parent: asset.id },
          transaction
        });

        for (const child of childAssets) {
          await child.destroy({ transaction });
        }

        // 2. Soft delete associated task hazards
        await models.task_hazards.destroy({
          where: { assetHierarchyId: asset.id },
          transaction
        });

        // 3. Soft delete associated risk assessments
        await models.risk_assessments.destroy({
          where: { assetHierarchyId: asset.id },
          transaction
        });

        console.log(`Cascading soft delete completed for asset: ${asset.id} and ${childAssets.length} children`);
      } catch (error) {
        console.error(`Error in beforeDestroy hook for asset ${asset.id}:`, error);
        throw error;
      }
    });

    this.addHook('afterRestore', async (asset, options) => {
      const { transaction } = options;

      try {
        // 1. Restore child assets that were soft deleted and had this asset as parent
        const childAssets = await models.asset_hierarchy.unscoped().findAll({
          where: {
            parent: asset.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

        for (const child of childAssets) {
          await child.restore({ transaction });
        }

        // 2. Restore associated task hazards that were soft deleted
        await models.task_hazards.restore({
          where: {
            assetHierarchyId: asset.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

        // 3. Restore associated risk assessments that were soft deleted
        await models.risk_assessments.restore({
          where: {
            assetHierarchyId: asset.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

        console.log(`Cascading restore completed for asset: ${asset.id} and ${childAssets.length} children`);
      } catch (error) {
        console.error(`Error in afterRestore hook for asset ${asset.id}:`, error);
        throw error;
      }
    });
  };
}

module.exports = AssetHierarchy;
