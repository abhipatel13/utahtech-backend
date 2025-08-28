const { Sequelize } = require('sequelize');

class TaskHazardIndividuals extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'id'
      },
      taskHazardId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'task_hazard_id',
        references: {
          model: 'task_hazards',
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
      modelName: 'task_hazard_individuals',
      tableName: 'task_hazard_individuals',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    // Junction table doesn't need associations as they're handled by the main models
  }
}

module.exports = TaskHazardIndividuals; 