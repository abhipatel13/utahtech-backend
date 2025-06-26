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
      include: [{ model: models.company, as: 'company' }]
    });
  }

  static associate(models) {
    this.belongsTo(models.company, { 
      foreignKey: 'company_id',
      as: 'company'
    });
  }
}

module.exports = Tactic;