module.exports = (sequelize, Sequelize) => {
  const Payment = sequelize.define("payments", {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    amount: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false
    },
    paymentDate: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    validUntil: {
      type: Sequelize.DATE,
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM('pending', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    transactionId: {
      type: Sequelize.STRING,
      unique: true
    },
    paymentMethod: {
      type: Sequelize.STRING,
      allowNull: false
    },
    processedBy: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
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

  Payment.associate = function(models) {
    Payment.belongsTo(models.users, { foreignKey: 'userId', as: 'user' });
    Payment.belongsTo(models.users, { foreignKey: 'processedBy', as: 'processor' });
  };

  return Payment;
}; 