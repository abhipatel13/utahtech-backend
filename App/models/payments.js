const { Sequelize } = require('sequelize');

class Payment extends Sequelize.Model {
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
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      paymentDate: {
        type: DataTypes.DATE,
        defaultValue: new Date(),
        allowNull: true
      },
      validUntil: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed'),
        defaultValue: 'pending'
      },
      transactionId: {
        type: DataTypes.STRING,
        unique: true
      },
      paymentMethod: {
        type: DataTypes.STRING,
        allowNull: false
      },
      processedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: new Date()
      },
      updatedAt: {
        field: 'updated_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: new Date()
      }
    }, {
      sequelize,
      modelName: 'payments',
      tableName: 'payments',
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.user, { foreignKey: 'userId', as: 'user' });
    this.belongsTo(models.user, { foreignKey: 'processedBy', as: 'processor' });
  }
}

module.exports = Payment;