module.exports = (sequelize, Sequelize) => {
  const Tactic = sequelize.define("tactics", {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false
    },
    company: {
      type: Sequelize.STRING(150),
      allowNull: false,
      references: {
        model: 'users',
        key: 'company'
      }
    },
    analysis_name: {
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
    asset_details: {
      type: Sequelize.JSON,
      allowNull: false
    }
  }, {
    underscored: true,
    timestamps: true
  });

  return Tactic;
}; 