const fs = require('fs');
const path = require('path');
const dbConfig = require("../configs/db.config.js");
const { MODEL_SYNC_ORDER } = require("../configs/syncOrder.config.js");
const basename = path.basename(__filename);
const Sequelize = require("sequelize");
const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  port: dbConfig.PORT,
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

/**
 * Sync models in a specific order to avoid foreign key constraint errors.
 * 
 * Models defined in MODEL_SYNC_ORDER are synced first in that order.
 * Any models not in the list are synced afterward (with a warning logged).
 * 
 * @param {Object} options - Sequelize sync options (e.g., { force: true, alter: true })
 * @returns {Promise<void>}
 */
db.syncInOrder = async function(options = {}) {
  const modelNames = Object.keys(db).filter(
    key => db[key] && db[key].prototype instanceof Sequelize.Model
  );

  // Separate models into ordered and unordered
  const orderedModels = [];
  const unorderedModels = [];

  for (const modelName of modelNames) {
    if (MODEL_SYNC_ORDER.includes(modelName)) {
      orderedModels.push(modelName);
    } else {
      unorderedModels.push(modelName);
    }
  }

  // Sort ordered models according to MODEL_SYNC_ORDER
  orderedModels.sort((a, b) => {
    return MODEL_SYNC_ORDER.indexOf(a) - MODEL_SYNC_ORDER.indexOf(b);
  });

  // Warn about unordered models
  if (unorderedModels.length > 0) {
    console.warn(
      `[syncInOrder] Warning: The following models are not in MODEL_SYNC_ORDER and will be synced last:`,
      unorderedModels.join(', ')
    );
    console.warn(
      `[syncInOrder] Consider adding them to App/configs/syncOrder.config.js in the appropriate tier.`
    );
  }

  // Sync ordered models first
  console.log(`[syncInOrder] Syncing ${orderedModels.length} models in defined order...`);
  for (const modelName of orderedModels) {
    await db[modelName].sync(options);
    console.log(`[syncInOrder] Synced: ${modelName}`);
  }

  // Sync any remaining models
  if (unorderedModels.length > 0) {
    console.log(`[syncInOrder] Syncing ${unorderedModels.length} additional models...`);
    for (const modelName of unorderedModels) {
      await db[modelName].sync(options);
      console.log(`[syncInOrder] Synced (unordered): ${modelName}`);
    }
  }

  console.log(`[syncInOrder] All models synced successfully.`);
};

module.exports = db;

