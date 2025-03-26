const fs = require('fs');
const path = require('path');
const dbConfig = require("../configs/db.config.js");
const basename = path.basename(__filename);
const Sequelize = require("sequelize");
const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  operatorsAliases: false,

  pool: {
    max: dbConfig.pool.max,
    min: dbConfig.pool.min,
    acquire: dbConfig.pool.acquire,
    idle: dbConfig.pool.idle
  }
});

const db = {};

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.asset_hierarchy = require("./asset_hierarchy.js")(sequelize, Sequelize);
db.task_hazards = require("./task_hazards.js")(sequelize, Sequelize);
db.task_risks = require("./task_risks.js")(sequelize, Sequelize);

// Define relationships
db.task_hazards.hasMany(db.task_risks, {
  foreignKey: 'taskHazardId',
  as: 'risks'
});

db.task_risks.belongsTo(db.task_hazards, {
  foreignKey: 'taskHazardId',
  as: 'taskHazard'
});

// db.task_hazards.belongsTo(db.asset_heirarchies, {
  //   foreignKey: 'assetSystem',
  //   as: 'asset'
  // });

module.exports = db;

