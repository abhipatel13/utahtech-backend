const { Sequelize } = require("sequelize");

class Site extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'company_id',
        references: {
          model: 'company',
          key: 'id'
        }
      }
    }, {
      sequelize,
      modelName: 'site',
      tableName: 'sites',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.company, {  
      foreignKey: "companyId",
      as: 'company'
    });

    this.hasMany(models.user, {
      foreignKey: 'site_id',
      as: 'users'
    });

    this.hasMany(models.task_hazards);

    this.hasMany(models.asset_hierarchy, { 
      foreignKey: 'siteId',
      as: 'assets'
    });

    this.hasMany(models.file_uploads, { 
      foreignKey: 'siteId',
      as: 'fileUploads'
    });

    this.hasMany(models.tactics, { 
      foreignKey: 'site_id',
      as: 'tactics'
    });
  }
}

module.exports = Site;