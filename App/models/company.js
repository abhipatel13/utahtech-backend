const { Sequelize } = require('sequelize');

class Company extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      name: {
        type: DataTypes.STRING(150),
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'company',
      tableName: 'company',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.hasMany(models.user, {
      foreignKey: 'company_id',
      as: 'users'
    });
    this.hasMany(models.task_hazards);

    this.hasMany(models.asset_hierarchy, { 
      foreignKey: 'companyId',
      as: 'assets'
    });

    this.hasMany(models.tactics, { 
      foreignKey: 'company_id',
      as: 'tactics'
    });
  }
}

module.exports = Company;