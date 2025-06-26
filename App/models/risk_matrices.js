const { Sequelize } = require('sequelize');

class RiskMatrices extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      user_id: {
        type: DataTypes.INTEGER
      },
      row_no: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      col_no: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      col_name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      col_desc: {
        type: DataTypes.STRING,
        allowNull: false
      },
      row_name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      row_desc: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mat_val: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mat_color: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mat_type: {
        type: DataTypes.ENUM('personel', 'maintainance', 'revenue', 'process', 'environmental'),
        values: ['personel', 'maintainance', 'revenue','process', 'environmental'],
        // defaultValue: 'user' // 'user' is not a valid value in the enum
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: true
      },
      updatedAt: {
        field: 'updated_at',
        type: Sequelize.DATE,
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'risk_matrices',
      tableName: 'risk_matrices',
      underscored: true,
      paranoid: true
    });
  }
}

module.exports = RiskMatrices;
