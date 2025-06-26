const { Sequelize } = require('sequelize');

class ResetPasswords extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      reset_token: {
        type: DataTypes.STRING,
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'reset_passwords',
      tableName: 'reset_passwords',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'logUser'
    });
  }
}

module.exports = ResetPasswords;


