const bcrypt = require("bcryptjs");
const fs = require('fs');
const path = require('path');
const { generateAssetData, checkAndAddAssetsToDatabase } = require('./generators/assetGenerator');
const { generateTaskHazardData, checkAndAddTaskHazardsToDatabase } = require('./generators/taskHazardGenerator');

/**
 * Generates comprehensive test data 
 */
async function main() {
  const db = require("../../App/models");
  const bcrypt = require("bcryptjs");
  const fs = require('fs');
  const path = require('path');

  // Sync database without dropping tables
  db.sequelize.sync().then(async function () {
    try {
      // Load companies data
      const companiesData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'data/companies.json'), 'utf8')
      );
      
      // Create companies that don't exist in database
      for (const companyData of companiesData) {
        const existingCompany = await db.company.findOne({
          where: { name: companyData.name }
        });
        
        if (!existingCompany) {
          await db.company.create({
            name: companyData.name
          });
        }
      }
      
      // Reload companies to get their correct IDs
      const companies = await db.company.findAll();
      console.log(`Total companies in database: ${companies.length}`);
      
      // Create a map of company names to IDs for user association
      const companyMap = {};
      companies.forEach(company => {
        companyMap[company.name] = company.id;
      });
      
      // Load users data
      const usersData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'data/users.json'), 'utf8')
      );
      
      // Create users that don't exist in database
      for (const userData of usersData) {
        const existingUser = await db.user.findOne({
          where: { email: userData.email }
        });
        
        if (!existingUser) {
          // Find the company ID for this user
          const companyId = companyMap[userData.company];
          
          if (!companyId) {
            console.warn(`Company not found for user ${userData.email}: ${userData.company}`);
            continue;
          }
          
          await db.user.create({
            name: userData.name,
            email: userData.email,
            phone_no: userData.phone_no,
            company_id: companyId,
            department: userData.department,
            role: userData.role,
            business_unit: userData.business_unit,
            plant: userData.plant,
            password: bcrypt.hashSync('password123', 10)
          });
        }
      }
      
      const users = await db.user.findAll();
      console.log(`Total users in database: ${users.length}`);
      
      // Generate asset data if it doesn't exist
      const assetDataPath = path.join(__dirname, 'data/generated/generated_assets.csv');
      if (!fs.existsSync(assetDataPath)) {
        console.log("Generating asset data...");
        await generateAssetData(companies, assetDataPath);
        console.log(`Asset data generated: ${assetDataPath}`);
      } else {
        console.log("Asset data already exists, skipping generation.");
      }
      
      // Check if assets need to be added to database
      await checkAndAddAssetsToDatabase(db, assetDataPath);
      
      // Generate task hazard data if it doesn't exist
      const taskHazardDataPath = path.join(__dirname, 'data/generated/generated_task_hazards.json');
      if (!fs.existsSync(taskHazardDataPath)) {
        console.log("Generating task hazard data...");
        await generateTaskHazardData(companies, taskHazardDataPath);
        console.log(`Task hazard data generated: ${taskHazardDataPath}`);
      } else {
        console.log("Task hazard data already exists, skipping generation.");
      }
      
      // Check if task hazards need to be added to database
      await checkAndAddTaskHazardsToDatabase(db, taskHazardDataPath);
      
      console.log("Test data generation completed successfully.");
      
    } catch (error) {
      console.error("Error generating test data:", error);
    } finally {
      // Close database connection
      await db.sequelize.close();
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = { main }; 