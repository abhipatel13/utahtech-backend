const fs = require('fs');
const path = require('path');

async function generateRiskAssessmentData(companies, outputPath) {
  const items = [];
  const db = require('../../../App/models');

  for (const company of companies) {
    // Fetch assets for this company once
    const allAssets = await db.asset_hierarchy.findAll({
      where: { companyId: company.id },
      attributes: ['id', 'name', 'siteId']
    });
    if (allAssets.length === 0) {
      console.warn(`No assets for company ${company.name}, skipping risk assessments generation`);
      continue;
    }

    // Iterate each site and generate 40-100 assessments per site
    const sites = await db.site.findAll({ where: { companyId: company.id } });
    if (!sites || sites.length === 0) {
      console.warn(`No sites for company ${company.name}, skipping risk assessments generation`);
      continue;
    }

    for (const site of sites) {
      const siteAssets = allAssets.filter(a => a.siteId === site.id);
      if (siteAssets.length === 0) {
        console.warn(`No assets for site ${site.name} (${company.name}), skipping`);
        continue;
      }

      const siteUsers = await db.user.findAll({
        where: { company_id: company.id, site_id: site.id },
        attributes: ['id', 'email', 'name', 'role', 'site_id']
      });
      const supervisors = siteUsers.filter(u => u.role === 'supervisor' || u.role === 'admin' || u.role === 'superuser');
      const employees = siteUsers.filter(u => u.role === 'user' || u.role === 'supervisor');
      if (supervisors.length === 0 || employees.length === 0) {
        console.warn(`Insufficient users for site ${site.name} (${company.name}), skipping`);
        continue;
      }

      const perSite = 40 + Math.floor(Math.random() * 61); // 40-100
      for (let i = 0; i < perSite; i++) {
        const asset = siteAssets[Math.floor(Math.random() * siteAssets.length)];
        // Supervisor from same site (siteUsers already filtered)
        const supervisor = supervisors[Math.floor(Math.random() * supervisors.length)];

        // 1-4 individuals
        const shuffled = [...employees].sort(() => 0.5 - Math.random());
        const cnt = Math.floor(Math.random() * 4) + 1;
        const inds = shuffled.slice(0, Math.min(cnt, shuffled.length)).map(e => e.email).join(', ');

        // date/time within 30 days
        const today = new Date();
        const daysAgo = Math.floor(Math.random() * 30);
        const d = new Date(today);
        d.setDate(today.getDate() - daysAgo);
        const date = d.toISOString().split('T')[0];
        const time = `${String(Math.floor(Math.random()*24)).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;

        // Scope and flags
        const scopeOfWork = `Routine safety assessment for ${asset.name}`;
        const systemLockoutRequired = Math.random() < 0.5;
        const trainedWorkforce = Math.random() < 0.7;
        // Generate location similar to task hazards (small offset around a company site)
        const location = generateRandomLocation(company.name);
        const status = 'Active';

        // Risks
        const risks = generateRisks();

        items.push({
          companyId: company.id,
          siteId: asset.siteId,
          date,
          time,
          scopeOfWork,
          assetSystem: asset.id,
          systemLockoutRequired,
          trainedWorkforce,
          individuals: inds,
          supervisor: supervisor.email,
          location,
          status,
          risks
        });
      }
    }
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
  return items;
}

function generateRisks() {
  const templates = [
    { riskDescription: 'Exposure to moving machinery parts', riskType: 'Personnel', mitigatingAction: 'Implement LOTO', mitigatingActionType: 'Administrative' },
    { riskDescription: 'Electrical shock or electrocution', riskType: 'Maintenance', mitigatingAction: 'De-energize and test', mitigatingActionType: 'Control' },
    { riskDescription: 'Fall from height during maintenance', riskType: 'Personnel', mitigatingAction: 'Use fall protection', mitigatingActionType: 'Control' },
    { riskDescription: 'Environmental contamination from spills', riskType: 'Environmental', mitigatingAction: 'Spill kits and response', mitigatingActionType: 'Control' },
    { riskDescription: 'Process control system failure', riskType: 'Process', mitigatingAction: 'Redundant controls', mitigatingActionType: 'Control' }
  ];
  const num = Math.floor(Math.random()*3)+1;
  const shuffled = templates.sort(() => 0.5 - Math.random()).slice(0, num);
  return shuffled.map(t => ({
    riskDescription: t.riskDescription,
    riskType: t.riskType,
    asIsLikelihood: pickScale(['Very Unlikely','Slight Chance','Feasible','Likely','Very Likely']),
    asIsConsequence: pickScale(['Minor','Significant','Serious','Major','Catastrophic']),
    mitigatingAction: t.mitigatingAction,
    mitigatingActionType: t.mitigatingActionType,
    mitigatedLikelihood: pickScale(['Very Unlikely','Slight Chance','Feasible']),
    mitigatedConsequence: pickScale(['Minor','Significant','Serious']),
    requiresSupervisorSignature: Math.random() < 0.1
  }));
}

function pickScale(arr) {
  return arr[Math.floor(Math.random()*arr.length)];
}

async function checkAndAddRiskAssessmentsToDatabase(db, raDataPath) {
  try {
    const json = fs.readFileSync(raDataPath, 'utf8');
    const items = JSON.parse(json);
    if (!items.length) return;

    // Idempotence check: if any exist, skip
    const existing = await db.risk_assessments.findOne();
    if (existing) return;

    const controller = require('../../../App/controllers/risk_assessment.controller');
    let created = 0;
    for (const item of items) {
      try {
        const req = createMockRequest(item);
        const res = createMockResponse();
        await controller.create(req, res);
        if (res.statusCode === 201) created++;
      } catch (e) {
        console.warn(`RA create failed: ${e.message}`);
      }
    }
    console.log(`Risk assessments created: ${created}`);
  } catch (e) {
    console.error('Error adding risk assessments to database:', e);
  }
}

function createMockRequest(data) {
  return {
    user: {
      id: 1,
      company: { id: data.companyId },
      company_id: data.companyId,
      site_id: data.siteId
    },
    body: {
      date: data.date,
      time: data.time,
      scopeOfWork: data.scopeOfWork,
      assetSystem: data.assetSystem,
      systemLockoutRequired: data.systemLockoutRequired,
      trainedWorkforce: data.trainedWorkforce,
      individuals: data.individuals,
      supervisor: data.supervisor,
      location: data.location,
      status: data.status,
      risks: data.risks
    }
  };
}

function createMockResponse() {
  const res = {
    statusCode: null,
    jsonData: null,
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) { this.jsonData = data; return this; }
  };
  return res;
}

module.exports = {
  generateRiskAssessmentData,
  checkAndAddRiskAssessmentsToDatabase
};

function generateRandomLocation(companyName) {
  try {
    const companiesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/companies.json'), 'utf8'));
    const cfg = companiesData.find(c => c.name === companyName);
    const base = (cfg && cfg.locations && cfg.locations[0]) ? cfg.locations[0] : { latitude: 0, longitude: 0 };
    const latOffset = (Math.random() - 0.5) * 0.02;
    const lngOffset = (Math.random() - 0.5) * 0.02;
    const lat = (base.latitude + latOffset).toFixed(6);
    const lng = (base.longitude + lngOffset).toFixed(6);
    return `${lat}, ${lng}`;
  } catch (e) {
    return '0.000000, 0.000000';
  }
}


