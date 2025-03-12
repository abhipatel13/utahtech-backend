require('dotenv').config();
const db = require('./App/models');
const assetSeed = require('./App/seeders/asset_seed');

async function seedDatabase() {
  try {
    // Force sync to recreate tables
    await db.sequelize.sync({ force: true });
    console.log("Database synced");

    // Run the asset seed
    await assetSeed.up(db.sequelize.getQueryInterface(), db.Sequelize);
    console.log("Assets seeded successfully");

    console.log("All seeds completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase(); 