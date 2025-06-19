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

// Import User model directly (it's a class, not a Sequelize model)
const User = require("./User.js");
db.User = User;


// TODO:: REMOVE after testing relationships
// Import models
// db.company = require("./company.js")(sequelize, Sequelize);
// db.users = require("./users.js")(sequelize, Sequelize);
// db.asset_hierarchy = require("./asset_hierarchy.js")(sequelize, Sequelize);
// db.task_hazards = require("./task_hazards.js")(sequelize, Sequelize);
// db.task_risks = require("./task_risks.js")(sequelize, Sequelize);
// db.tactics = require("./Tactic.js")(sequelize, Sequelize);
// db.file_uploads = require("./file_uploads.js")(sequelize, Sequelize);
// db.reset_password = require("./reset_passwords.js")(sequelize, Sequelize);

// Define relationships
// db.task_hazards.hasMany(db.task_risks,{ 
//   foreignKey: 'taskHazard_id', 
//   as: 'risks' 
// });
// db.task_risks.belongsTo(db.task_hazards, { 
//   foreignKey: { 
//     allowNull: false,
//     name: 'taskHazard_id'
//   }
// });

// db.company.hasMany(db.task_hazards);
// db.task_hazards.belongsTo(db.company, {  
//   foreignKey: "company_id",
//   as: 'company'
// });

// db.users.hasMany(db.file_uploads);
// db.file_uploads.belongsTo(db.users, { 
//   foreignKey: "uploader_id",
//   as: 'uploadedBy'
// });

// db.asset_hierarchy.hasMany(db.task_hazards, { 
//   foreignKey: 'asset_hierarchy_id',
//   as: 'taskHazards'
// });
// db.task_hazards.belongsTo(db.asset_hierarchy, {
//   foreignKey: 'asset_hierarchy_id',
//   as: 'asset'
// });

// db.company.hasMany(db.asset_hierarchy, { 
//   foreignKey: 'company_id',
//   as: 'assets'
// });
// db.asset_hierarchy.belongsTo(db.company, { 
//   foreignKey: 'company_id',
//   as: 'company'
// });

// db.users.hasMany(db.reset_password, {
//   foreignKey: 'user_id',
//   as: 'resetPassword'
// });
// db.reset_password.belongsTo(db.users, {
//   foreignKey: 'user_id',
//   as: 'logUser'
// });

// db.company.hasMany(db.tactics, { 
//   foreignKey: 'company_id',
//   as: 'tactics'
// });
// db.tactics.belongsTo(db.company, { 
//   foreignKey: 'company_id',
//   as: 'company'
// });

module.exports = db;

