module.exports = (sequelize, Sequelize) => {
  const Tactic = sequelize.define("tactics", {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    analysisName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    location: {
      type: Sequelize.STRING,
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM('Active', 'Inactive', 'Pending'),
      defaultValue: 'Active'
    },
    assetDetails: {
      type: Sequelize.JSON,
      allowNull: false
    }
  }, {
    tableName: 'tactics',
    timestamps: true,
    underscored: true
  });

  Tactic.associate = function(models) {
    Tactic.belongsTo(models.company, { 
      foreignKey: 'company_id',
      as: 'company'
    });
  };

  return Tactic;
}; 