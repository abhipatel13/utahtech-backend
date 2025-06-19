  
module.exports = (sequelize, Sequelize) => {
	const reset_passwords = sequelize.define("reset_passwords", {
    user_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
	  },
    reset_token: { 
      type: Sequelize.STRING, 
      allowNull: false 
    }
  }, {
    tableName: 'reset_passwords',
    timestamps: true,
    underscored: true
  });

  reset_passwords.associate = function(models) {
    reset_passwords.belongsTo(models.users, {
      foreignKey: 'user_id',
      as: 'logUser'
    });
  };
  return reset_passwords;
};


