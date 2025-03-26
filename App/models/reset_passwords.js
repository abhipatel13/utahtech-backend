  
module.exports = (sequelize, Sequelize) => {
	const reset_passwords = sequelize.define("reset_passwords", {
        _userId: {
        type: Sequelize.INTEGER,
        references: {         // reset_passwords belongsTo Company 1:1
          model: 'users',
          key: 'id'
        }
	},
    resettoken: { type: Sequelize.STRING, allowNull: false },
    createdAt: {
      field: 'created_at',
      type: Sequelize.DATE,
      allowNull: true
    },
    updatedAt: {
      field: 'updated_at',
      type: Sequelize.DATE,
      allowNull: true
    }
});
  reset_passwords.associate = function(models) {
    reset_passwords.belongsTo(models.users, {foreignKey: '_userId', as: 'user'})
  };
  return reset_passwords;
};


