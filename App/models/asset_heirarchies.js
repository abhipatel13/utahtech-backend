module.exports = (sequelize, Sequelize) => {
	const asset_heirarchies = sequelize.define("asset_heirarchies", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name:  { type: Sequelize.STRING, allowNull: false },
    parent:  { type: Sequelize.INTEGER },
    assetId : {
     type: Sequelize.INTEGER,
     allowNull: false,
     unique : true
   },
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

  return asset_heirarchies;
};
