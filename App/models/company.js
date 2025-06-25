module.exports = (sequelize, Sequelize) => {
  const Company = sequelize.define("company", {
    name: {
      type: Sequelize.STRING(150),
      allowNull: false
    }
  }, {
    tableName: 'company',
    timestamps: true,
    underscored: true,
    paranoid: true
  });

  Company.associate = function(models) {
    Company.hasMany(models.users, {
      foreignKey: 'company_id',
      as: 'users'
    });
    Company.hasMany(models.task_hazards);

    Company.hasMany(models.asset_hierarchy, { 
      foreignKey: 'company_id',
      as: 'assets'
    });

    Company.hasMany(models.tactics, { 
      foreignKey: 'company_id',
      as: 'tactics'
    });
    
  };

  return Company;
}