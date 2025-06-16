module.exports = (sequelize, Sequelize) => {
  const Notification = sequelize.define("notifications", {
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
    title: {
      type: Sequelize.STRING,
      allowNull: false
    },
    message: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    type: {
      type: Sequelize.ENUM('payment', 'system', 'other'),
      defaultValue: 'payment'
    },
    isRead: {
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

  Notification.associate = function(models) {
    Notification.belongsTo(models.users, { foreignKey: 'userId', as: 'user' });
  };

  return Notification;
}; 