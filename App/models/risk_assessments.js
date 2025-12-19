const { Sequelize } = require('sequelize');

class RiskAssessment extends Sequelize.Model {
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
        type: DataTypes.CHAR(36),  // Updated for UUIDv7 internal IDs
        allowNull: true,
        field: 'asset_hierarchy_id',
        references: {
          model: 'asset_hierarchy',
          key: 'id'
        }
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
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending',
        field: 'status'
      }
    }, {
      sequelize,
      modelName: 'risk_assessments',
      tableName: 'risk_assessments',
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

    this.belongsTo(models.user, {
      foreignKey: 'supervisorId',
      as: 'supervisor'
    });

    // Many-to-many relationship with users for multiple individuals
    this.belongsToMany(models.user, {
      through: models.risk_assessment_individuals,
      foreignKey: 'riskAssessmentId',
      otherKey: 'userId',
      as: 'individuals'
    });

    // One-to-many relationship with risk assessment risks
    this.hasMany(models.risk_assessment_risks, {
      foreignKey: 'riskAssessmentId',
      as: 'risks'
    });

    // Add hooks for cascading soft delete/restore
    this.addHook('beforeDestroy', async (riskAssessment, options) => {
      const { transaction } = options;
      
      try {
        // 1. Soft delete associated risk assessment risks
        await models.risk_assessment_risks.destroy({
          where: { riskAssessmentId: riskAssessment.id },
          transaction
        });

        // 2. Remove associations with individuals (junction table records)
        await models.risk_assessment_individuals.destroy({
          where: { riskAssessmentId: riskAssessment.id },
          transaction
        });

        console.log(`Cascading soft delete completed for risk assessment: ${riskAssessment.id}`);
      } catch (error) {
        console.error(`Error in beforeDestroy hook for risk assessment ${riskAssessment.id}:`, error);
        throw error;
      }
    });

    this.addHook('afterRestore', async (riskAssessment, options) => {
      const { transaction } = options;
      
      try {
        // 1. Restore associated risk assessment risks
        await models.risk_assessment_risks.restore({
          where: { 
            riskAssessmentId: riskAssessment.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

        // 2. Restore associations with individuals (junction table records)
        await models.risk_assessment_individuals.restore({
          where: { 
            riskAssessmentId: riskAssessment.id,
            deletedAt: { [models.Sequelize.Op.ne]: null }
          },
          transaction
        });

        console.log(`Cascading restore completed for risk assessment: ${riskAssessment.id}`);
      } catch (error) {
        console.error(`Error in afterRestore hook for risk assessment ${riskAssessment.id}:`, error);
        throw error;
      }
    });
  };

  static scopes(models) {
    this.addScope('defaultScope', {
      include: [
        { model: models.company, 
          as: 'company', 
          attributes: ['id', 'name'] },
        { model: models.risk_assessment_risks, as: 'risks' },
        { model: models.user, as: 'supervisor', attributes: ["id", "email", "name", "role"] },
        { model: models.user, as: 'individuals', attributes: ["id", "email", "name", "role"] },
      ],
      attributes: [
        'id', 
        'date', 
        'time', 
        'scopeOfWork', 
        ['asset_hierarchy_id', 'assetSystem'], 
        'location', 
        'status',
        'createdAt'
      ],
      order: [['createdAt', 'DESC']],
    });

  }
}

module.exports = RiskAssessment;
