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
    const modelClass = require(path.join(__dirname, file));
    const model = modelClass.init(sequelize, Sequelize.DataTypes);

    db[model.name] = model;
  });

// Initialize model associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Initialize model scopes
Object.keys(db).forEach(modelName => {
  if (db[modelName].scopes) {
    db[modelName].scopes(db);
  }
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;

module.exports = db;

