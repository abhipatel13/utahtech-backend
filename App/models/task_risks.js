module.exports = (sequelize, Sequelize) => {
  const TaskRisk = sequelize.define("task_risks", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    taskHazardId: {
      type: Sequelize.STRING,
      allowNull: false,
      references: {
        model: 'task_hazards',
        key: 'id'
      }
    },
    riskDescription: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    riskType: {
      type: Sequelize.STRING,
      allowNull: false
    },
    asIsLikelihood: {
      type: Sequelize.INTEGER,
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
      type: Sequelize.INTEGER,
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
      type: Sequelize.TEXT,
      allowNull: false
    },
    mitigatingActionType: {
      type: Sequelize.STRING,
      allowNull: false
    },
    mitigatedLikelihood: {
      type: Sequelize.INTEGER,
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
      type: Sequelize.INTEGER,
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
      type: Sequelize.BOOLEAN,
      defaultValue: false
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
  });

  // Define the association
  TaskRisk.associate = function(models) {
    // A TaskRisk belongs to a TaskHazard
    TaskRisk.belongsTo(models.task_hazards, {
      foreignKey: 'taskHazardId',
      as: 'taskHazard'
    });
  };

  return TaskRisk;
}; 