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
    // Skip User.js as it's a class, not a Sequelize model
    if (file === 'User.js') return;
    if (file === 'users.js') return;
    
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Imports user model separately as its a class extending Sequelize.Model instead of a sequelize.define
const usersModel = require("./users.js");
const users = usersModel.init(sequelize, Sequelize.DataTypes);
db.users = users;

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import User model directly (it's a class, not a Sequelize model)
const User = require("./User.js");
db.User = User;

module.exports = db;

