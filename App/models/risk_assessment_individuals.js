const { Sequelize } = require('sequelize');

class RiskAssessmentIndividuals extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'id'
      },
      riskAssessmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'risk_assessment_id',
        references: {
          model: 'risk_assessments',
          key: 'id'
        }
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
        references: {
          model: 'users',
          key: 'id'
        }
      }
    }, {
      sequelize,
      modelName: 'risk_assessment_individuals',
      tableName: 'risk_assessment_individuals',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    // Junction table doesn't need associations as they're handled by the main models
  }
}

module.exports = RiskAssessmentIndividuals; 