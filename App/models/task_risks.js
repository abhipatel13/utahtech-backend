const { Sequelize } = require('sequelize');

class TaskRisk extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      taskHazard_id: {
        type: DataTypes.STRING,
        allowNull: false
      },
      riskDescription: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      riskType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      asIsLikelihood: {
      type: DataTypes.INTEGER,
      allowNull: false,
      get() {
        const value = this.getDataValue('asIsLikelihood');
        const likelihoodMap = {
          1: 'Very Unlikely',
          2: 'Slight Chance',
          3: 'Feasible',
          4: 'Likely',
          5: 'Very Likely'
        };
        return likelihoodMap[value] || value;
      }
    },
    asIsConsequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      get() {
        const value = this.getDataValue('asIsConsequence');
        const consequenceMap = {
          1: 'Minor',
          2: 'Significant',
          3: 'Serious',
          4: 'Major',
          5: 'Catastrophic'
        };
        return consequenceMap[value] || value;
      }
    },
    mitigatingAction: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    mitigatingActionType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mitigatedLikelihood: {
      type: DataTypes.INTEGER,
      allowNull: false,
      get() {
        const value = this.getDataValue('mitigatedLikelihood');
        const likelihoodMap = {
          1: 'Very Unlikely',
          2: 'Slight Chance',
          3: 'Feasible',
          4: 'Likely',
          5: 'Very Likely'
        };
        return likelihoodMap[value] || value;
      }
    },
    mitigatedConsequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      get() {
        const value = this.getDataValue('mitigatedConsequence');
        const consequenceMap = {
          1: 'Minor',
          2: 'Significant',
          3: 'Serious',
          4: 'Major',
          5: 'Catastrophic'
        };
        return consequenceMap[value] || value;
      }
    },
    requiresSupervisorSignature: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
    }, {
      sequelize,
      modelName: 'task_risks',
      tableName: 'task_risks',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.task_hazards, { 
      foreignKey: 'taskHazard_id',
      as: 'hazards'
    });
  }
}

module.exports = TaskRisk;