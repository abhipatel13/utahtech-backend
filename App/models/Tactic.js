const { Sequelize } = require('sequelize');

class Tactic extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
      },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'company',
          key: 'id'
        }
      },
      site_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'sites',
          key: 'id'
        }
      },
      analysisName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('Active', 'Inactive', 'Pending'),
        defaultValue: 'Active'
      },
      assetDetails: {
        type: DataTypes.JSON,
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'tactics',
      tableName: 'tactics',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static scopes(models) {
    // Password is excluded by default, but can be included by using the 'auth' scope
    this.addScope('defaultScope', {
      include: [
        { model: models.company, as: 'company' },
        { model: models.site, as: 'site' }
      ]
    });
  }

  static associate(models) {
    this.belongsTo(models.company, { 
      foreignKey: 'company_id',
      as: 'company'
    });
    this.belongsTo(models.site, { 
      foreignKey: 'site_id',
      as: 'site'
    });
  }
}

module.exports = Tactic;