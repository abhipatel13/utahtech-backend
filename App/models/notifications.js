const { Sequelize } = require('sequelize');

class Notification extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('payment', 'system', 'other'),
        defaultValue: 'payment'
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        field: 'updated_at',
        type: DataTypes.DATE,
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'notifications',
      tableName: 'notifications',
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.user, { foreignKey: 'userId', as: 'user' });
  }
}

module.exports = Notification;