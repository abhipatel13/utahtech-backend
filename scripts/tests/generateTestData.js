const bcrypt = require("bcryptjs");
const fs = require('fs');
const path = require('path');
const { generateAssetData, checkAndAddAssetsToDatabase } = require('./generators/assetGenerator');
const { generateTaskHazardData, checkAndAddTaskHazardsToDatabase } = require('./generators/taskHazardGenerator');
const { generateRiskAssessmentData, checkAndAddRiskAssessmentsToDatabase } = require('./generators/riskAssessmentGenerator');

/**
 * Generates comprehensive test data 
 */
async function main() {
  const db = require("../../App/models");

  // Helper to fail fast
  const assertOrThrow = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  // Linear flow with verification and stop on error
  await db.sequelize.sync();

  try {
    // 1) Companies and Sites
    const companiesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/companies.json'), 'utf8'));
    assertOrThrow(Array.isArray(companiesData) && companiesData.length > 0, 'No companies found in companies.json');

    for (const companyData of companiesData) {
      let company = await db.company.findOne({ where: { name: companyData.name } });
      if (!company) company = await db.company.create({ name: companyData.name });

      // Create sites for each location if missing
      for (const loc of (companyData.locations || [])) {
        const site = await db.site.findOne({ where: { name: loc.name, companyId: company.id } });
        if (!site) await db.site.create({ name: loc.name, companyId: company.id });
      }
    }

    const companies = await db.company.findAll();
    assertOrThrow(companies.length === companiesData.length, `Company count mismatch. Expected ${companiesData.length}, found ${companies.length}`);
    console.log(`Companies created/verified: ${companies.length}`);

    // Verify sites per company
    for (const c of companies) {
      const cfg = companiesData.find(x => x.name === c.name);
      const sites = await db.site.findAll({ where: { companyId: c.id } });
      assertOrThrow(sites.length === (cfg.locations || []).length, `Sites mismatch for ${c.name}. Expected ${(cfg.locations || []).length}, found ${sites.length}`);
    }
    console.log('Sites created/verified for all companies');

    // 2) Users (with site assignment and email numbering)
    const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/users.json'), 'utf8'));
    assertOrThrow(Array.isArray(usersData) && usersData.length > 0, 'No users found in users.json');

    const companyMap = {};
    for (const c of companies) companyMap[c.name] = c.id;

    for (const userData of usersData) {
      const companyId = companyMap[userData.company];
      assertOrThrow(companyId, `Company not found for user ${userData.email}: ${userData.company}`);

      const allSites = await db.site.findAll({ where: { companyId }, order: [['id','ASC']] });
      assertOrThrow(allSites.length > 0, `No sites for companyId ${companyId} while creating user ${userData.email}`);

      let site = allSites.find(s => s.name.toLowerCase().includes((userData.plant || '').split(' ')[0].toLowerCase())) || allSites[0];

      const email = (userData.email || '').trim();
      const existing = await db.user.findOne({ where: { email }, paranoid: false });
      if (existing) {
        if (!existing.site_id && site) await existing.update({ site_id: site.id });
        continue;
      }

      await db.user.create({
        name: userData.name,
        email,
        phone_no: userData.phone_no,
        company_id: companyId,
        site_id: site ? site.id : null,
        department: userData.department,
        role: userData.role,
        business_unit: userData.business_unit,
        plant: userData.plant,
        password: bcrypt.hashSync('password123', 10)
      });
    }

    // Universal user
    const universalEmail = 'universal@utahtechspecialists.com';
    let universal = await db.user.findOne({ where: { email: universalEmail }, paranoid: false });
    if (!universal) {
      await db.user.create({
        name: 'Universal User',
        email: universalEmail,
        phone_no: '000-000-0000',
        company_id: null,
        site_id: null,
        department: 'System',
        role: 'universal_user',
        business_unit: 'Administration',
        plant: null,
        password: bcrypt.hashSync('password123', 10)
      });
      console.log('Created universal user');
    }

    const userCount = await db.user.count();
    assertOrThrow(userCount > 0, 'No users present after creation');
    console.log(`Users present: ${userCount}`);

    // 3) Assets (generate → import → verify)
    const assetDataPath = path.join(__dirname, 'data/generated/generated_assets.csv');
    if (!fs.existsSync(assetDataPath)) {
      console.log('Generating asset data...');
      await generateAssetData(companies, assetDataPath);
      console.log(`Asset data generated: ${assetDataPath}`);
    }

    const initialAssetCount = await db.asset_hierarchy.count();
    if (initialAssetCount === 0) {
      const expectedAssets = Math.max(0, fs.readFileSync(assetDataPath, 'utf8').trim().split('\n').length - 1);
      await checkAndAddAssetsToDatabase(db, assetDataPath);
      const dbAssetCount = await db.asset_hierarchy.count();
      assertOrThrow(dbAssetCount >= expectedAssets, `Assets import shortfall. Expected >=${expectedAssets}, found ${dbAssetCount}`);
      console.log(`Assets present: ${dbAssetCount} (expected >= ${expectedAssets})`);
    } else {
      console.log(`Assets already present: ${initialAssetCount}. Skipping asset import.`);
    }

    // 4) Task hazards (generate → create via controller → verify)
    const thPath = path.join(__dirname, 'data/generated/generated_task_hazards.json');
    if (!fs.existsSync(thPath)) {
      console.log('Generating task hazard data...');
      await generateTaskHazardData(companies, thPath);
      console.log(`Task hazard data generated: ${thPath}`);
    }

    const initialThCount = await db.task_hazards.unscoped().count({ distinct: true, col: 'id' });
    if (initialThCount === 0) {
      const thData = JSON.parse(fs.readFileSync(thPath, 'utf8'));
      await checkAndAddTaskHazardsToDatabase(db, thPath);
      const thCount = await db.task_hazards.unscoped().count({ distinct: true, col: 'id' });
      assertOrThrow(thCount > 0, 'No task hazards present after creation');
      console.log(`Task hazards present: ${thCount} (generated: ${thData.length})`);
    } else {
      console.log(`Task hazards already present: ${initialThCount}. Skipping creation.`);
    }

    // 5) Risk assessments (generate → create via controller → verify)
    const raPath = path.join(__dirname, 'data/generated/generated_risk_assessments.json');
    if (!fs.existsSync(raPath)) {
      console.log('Generating risk assessment data...');
      await generateRiskAssessmentData(companies, raPath);
      console.log(`Risk assessment data generated: ${raPath}`);
    }

    const initialRaCount = await db.risk_assessments.unscoped().count({ distinct: true, col: 'id' });
    if (initialRaCount === 0) {
      const raData = JSON.parse(fs.readFileSync(raPath, 'utf8'));
      await checkAndAddRiskAssessmentsToDatabase(db, raPath);
      const raCount = await db.risk_assessments.unscoped().count({ distinct: true, col: 'id' });
      assertOrThrow(raCount > 0, 'No risk assessments present after creation');
      console.log(`Risk assessments present: ${raCount} (generated: ${raData.length})`);
    } else {
      console.log(`Risk assessments already present: ${initialRaCount}. Skipping creation.`);
    }

    console.log('Test data generation completed.');
  } catch (error) {
    console.error('Generation halted due to error:', error.message);
    throw error;
  } finally {
    await db.sequelize.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main }; 