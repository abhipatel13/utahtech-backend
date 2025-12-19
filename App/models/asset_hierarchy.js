const { Sequelize } = require('sequelize');

class AssetHierarchy extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: Sequelize.CHAR(36),  // UUIDv7 - internal ID
        primaryKey: true,
        allowNull: false,
        defaultValue: () => require('uuid').v7()
      },
      externalId: {
        type: Sequelize.STRING(255),  // User-provided ID, unique per company
        field: 'external_id',
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
        type: Sequelize.STRING,
        field: 'name',
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        field: 'description',
        allowNull: true
      },
      cmmsInternalId: {
        type: Sequelize.STRING,
        field: 'cmms_internal_id',
        allowNull: false
      },
      functionalLocation: {
        type: Sequelize.STRING,
        field: 'functional_location',
        allowNull: false
      },
      functionalLocationDesc: {
        type: Sequelize.STRING,
        field: 'functional_location_desc',
        allowNull: false
      },
      functionalLocationLongDesc: {
        type: Sequelize.TEXT,
        field: 'functional_location_long_desc',
        allowNull: true
      },
      parent: {
        type: Sequelize.CHAR(36),  // References internal ID
        field: 'parent_id',
        allowNull: true,
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
      },
      maintenancePlant: {
        type: Sequelize.STRING,
        field: 'maintenance_plant',
        allowNull: true
      },
      cmmsSystem: {
        type: Sequelize.STRING,
        field: 'cmms_system',
        allowNull: true
      },
      objectType: {
        type: Sequelize.STRING,
        field: 'object_type',
        allowNull: true
      },
      systemStatus: {
        type: Sequelize.STRING,
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
      },
      uploadOrder: {
        type: Sequelize.INTEGER,
        field: 'upload_order',
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'asset_hierarchy',
      tableName: 'asset_hierarchy',
      timestamps: true,
      underscored: true,
      paranoid: true
      // Note: Unique constraint on (external_id, company_id) for active records
      // is managed via functional index in scripts/fix-unique-constraints-soft-delete.js
      // Sequelize doesn't support functional indexes, so it's created via raw SQL
    });
  };

  static associate(models) {
    this.hasMany(models.asset_hierarchy, {
      foreignKey: 'parent',
      as: 'children'
    });

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
        const childAssets = await models.asset_hierarchy.findAll({
          where: { parent: asset.id },
          transaction
        });

        for (const child of childAssets) {
          await child.destroy({ transaction });
        }

        await models.task_hazards.destroy({
          where: { assetHierarchyId: asset.id },
          transaction
        });

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

        await models.task_hazards.restore({
          where: {
            assetHierarchyId: asset.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

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
