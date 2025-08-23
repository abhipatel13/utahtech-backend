const fs = require('fs');
const path = require('path');

/**
 * Generates task hazard data for each site
 */
async function generateTaskHazardData(companies, outputPath) {
  const taskHazards = [];
  
  for (const company of companies) {
    // Get company data from JSON to access locations
    const companiesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/companies.json'), 'utf8')
    );
    const companyData = companiesData.find(c => c.name === company.name);
    
    if (!companyData) {
      console.warn(`Company data not found for: ${company.name}`);
      continue;
    }
    
    // Generate 40-100 task hazards per site for this company
    const db = require("../../../App/models");
    const sites = await db.site.findAll({ where: { companyId: company.id } });
    if (!sites || sites.length === 0) {
      console.warn(`No sites found for company: ${company.name}`);
      continue;
    }

    for (const site of sites) {
      const count = 40 + Math.floor(Math.random() * 61); // 40-100 per site
      const siteTaskHazards = await generateSiteTaskHazards(company, companyData, site, count);
      taskHazards.push(...siteTaskHazards);
    }
  }
  
  // Ensure the generated directory exists
  const generatedDir = path.dirname(outputPath);
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  
  // Write task hazard data to JSON file
  writeTaskHazardsToJSON(taskHazards, outputPath);
  
  return taskHazards;
}

/**
 * Generates task hazards for a specific site
 */
async function generateSiteTaskHazards(company, companyData, site, count) {
  const taskHazards = [];
  const db = require("../../../App/models");
  
  // Get site's assets
  const assets = await db.asset_hierarchy.findAll({
    where: { companyId: company.id, siteId: site.id },
    attributes: ['id', 'name', 'objectType', 'siteId']
  });
  
  if (assets.length === 0) {
    console.warn(`No assets found for site ${site.name} (${company.name})`);
    return taskHazards;
  }
  
  // Get site's users
  const users = await db.user.findAll({
    where: { company_id: company.id, site_id: site.id },
    attributes: ['id', 'email', 'name', 'role', 'site_id']
  });
  
  if (users.length === 0) {
    console.warn(`No users found for site ${site.name} (${company.name})`);
    return taskHazards;
  }
  
  // Separate users by role
  const supervisors = users.filter(user => user.role === 'supervisor');
  const employees = users.filter(user => user.role === 'user');
  
  if (supervisors.length === 0) {
    console.warn(`No supervisors found for site ${site.name} (${company.name})`);
    return taskHazards;
  }
  
  if (employees.length === 0) {
    console.warn(`No employees found for site ${site.name} (${company.name})`);
    return taskHazards;
  }
  
  // Generate task hazards
  for (let i = 0; i < count; i++) {
    const taskHazard = await generateSingleTaskHazard(
      company, 
      companyData, 
      assets, 
      supervisors, 
      employees, 
      i
    );
    taskHazards.push(taskHazard);
  }
  
  return taskHazards;
}

/**
 * Generates a single task hazard
 */
async function generateSingleTaskHazard(company, companyData, assets, supervisors, employees, index) {
  // Select random asset
  const asset = assets[Math.floor(Math.random() * assets.length)];
  
  // Select random supervisor from same site as asset where possible
  let supervisor = supervisors.find(s => s.site_id === asset.siteId) || supervisors[Math.floor(Math.random() * supervisors.length)];
  
  // Select 1-4 random employees
  const numEmployees = Math.floor(Math.random() * 4) + 1;
  const selectedEmployees = [];
  const shuffledEmployees = [...employees.filter(e => e.site_id === asset.siteId)].sort(() => 0.5 - Math.random());
  if (shuffledEmployees.length === 0) {
    shuffledEmployees.push(...employees);
  }
  
  for (let i = 0; i < Math.min(numEmployees, shuffledEmployees.length); i++) {
    selectedEmployees.push(shuffledEmployees[i]);
  }
  
  // Generate location with small random offset from company location
  const location = generateRandomLocation(companyData);
  
  // Generate scope of work based on asset type
  const scopeOfWork = generateScopeOfWork(asset, index);
  
  // Generate trained workforce
  const trainedWorkforce = generateTrainedWorkforce(asset);
  
  // Generate risks with some requiring supervisor signature (mitigated L*C >= 12)
  const risks = generateRisks(asset);
  const mitigatedScore = (r) => {
    const mapL = { 'Very Unlikely': 1, 'Slight Chance': 2, 'Feasible': 3, 'Likely': 4, 'Very Likely': 5 };
    const mapC = { 'Minor': 1, 'Significant': 2, 'Serious': 3, 'Major': 4, 'Catastrophic': 5 };
    return (mapL[r.mitigatedLikelihood] || 1) * (mapC[r.mitigatedConsequence] || 1);
  };
  // Ensure some risks trigger approvals
  if (Math.random() < 0.2) {
    const r = risks[0];
    if (r) {
      r.mitigatedLikelihood = 'Very Likely';
      r.mitigatedConsequence = 'Major';
    }
  }
  // Set requiresSupervisorSignature based on score
  risks.forEach(r => {
    r.requiresSupervisorSignature = mitigatedScore(r) >= 12;
  });
  
  // Generate date and time (within last 30 days)
  const date = generateRandomDate();
  const time = generateRandomTime();
  
  // Determine if system lockout is required
  const systemLockoutRequired = Math.random() < 0.7; 
  
  // Generate geo fence limit
  const geoFenceLimit = (Math.floor(Math.random() * 40) * 10) + 50; 
  
  // Status distribution: mostly Active, some Completed, some Pending (approval required)
  let status = 'Active';
  const anyApproval = risks.some(r => r.requiresSupervisorSignature);
  const roll = Math.random();
  if (anyApproval && roll < 0.5) status = 'Pending';
  else if (roll < 0.2) status = 'Completed';
  
  return {
    companyId: company.id,
    siteId: asset.siteId,
    date: date,
    time: time,
    scopeOfWork: scopeOfWork,
    assetSystem: asset.id,
    systemLockoutRequired: systemLockoutRequired,
    trainedWorkforce: trainedWorkforce,
    individual: selectedEmployees.map(emp => emp.email).join(', '),
    supervisor: supervisor.email,
    location: location,
    status: status,
    geoFenceLimit: geoFenceLimit,
    risks: risks
  };
}

/**
 * Generates a random location with small offset from company location
 */
function generateRandomLocation(companyData) {
  // Select random location from company
  const location = companyData.locations[Math.floor(Math.random() * companyData.locations.length)];
  
  // Add small random offset
  const latOffset = (Math.random() - 0.5) * 0.02;
  const lngOffset = (Math.random() - 0.5) * 0.02;
  
  const lat = (location.latitude + latOffset).toFixed(6);
  const lng = (location.longitude + lngOffset).toFixed(6);
  
  return `${lat}, ${lng}`;
}

/**
 * Generates scope of work based on asset type
 */
function generateScopeOfWork(asset, index) {
  const scopes = {
    'HEAVY_MACHINERY': [
      'Routine maintenance and inspection',
      'Component replacement and repair',
      'Preventive maintenance procedures',
      'Safety system testing and calibration',
      'Lubrication and fluid checks',
      'Filter replacement and system cleaning',
      'Electrical system inspection',
      'Hydraulic system maintenance'
    ],
    'FACILITY': [
      'Building maintenance and repairs',
      'Safety system inspection',
      'Infrastructure maintenance',
      'Equipment installation and setup',
      'Facility cleaning and organization',
      'Security system maintenance',
      'Utility system inspection',
      'Structural integrity assessment'
    ],
    'AREA': [
      'Area safety inspection',
      'Equipment maintenance in area',
      'Environmental monitoring',
      'Safety barrier inspection',
      'Area cleaning and organization',
      'Equipment relocation',
      'Safety signage maintenance',
      'Area access control maintenance'
    ],
    'MAJOR_COMPONENT': [
      'Component inspection and testing',
      'Preventive maintenance',
      'Component replacement',
      'Performance optimization',
      'Safety system verification',
      'Calibration and adjustment',
      'Component cleaning',
      'Diagnostic testing'
    ],
    'SUB_ASSEMBLY': [
      'Assembly inspection and maintenance',
      'Component replacement within assembly',
      'Assembly testing and calibration',
      'Safety verification',
      'Performance optimization',
      'Assembly cleaning',
      'Preventive maintenance',
      'Diagnostic procedures'
    ],
    'COMPONENT': [
      'Component inspection',
      'Replacement procedures',
      'Testing and calibration',
      'Cleaning and maintenance',
      'Performance verification',
      'Safety checks',
      'Preventive maintenance',
      'Diagnostic testing'
    ]
  };
  
  const assetScopes = scopes[asset.objectType] || scopes['COMPONENT'];
  const scope = assetScopes[Math.floor(Math.random() * assetScopes.length)];
  
  return `${scope} for ${asset.name}`;
}

/**
 * Generates trained workforce flag (boolean)
 */
function generateTrainedWorkforce(asset) {
  // 70% chance that trained workforce is available
  return Math.random() < 0.7;
}

/**
 * Generates risks for a task hazard
 */
function generateRisks(asset, requiresSupervisorSignature) {
  const numRisks = Math.floor(Math.random() * 3) + 1; // 1-3 risks
  const risks = [];
  
  const riskTemplates = [
    {
      riskDescription: 'Exposure to moving machinery parts',
      riskType: 'Personnel',
      mitigatingAction: 'Implement lockout/tagout procedures and establish exclusion zones',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Electrical shock or electrocution',
      riskType: 'Maintenance',
      mitigatingAction: 'De-energize circuits, use proper testing equipment, wear arc-rated PPE',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Fall from height during maintenance',
      riskType: 'Personnel',
      mitigatingAction: 'Use fall protection systems, safety harnesses, and guardrails',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Exposure to hazardous chemicals or materials',
      riskType: 'Environmental',
      mitigatingAction: 'Use appropriate PPE, ventilation systems, and containment procedures',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Noise exposure exceeding safe limits',
      riskType: 'Personnel',
      mitigatingAction: 'Hearing protection required, limit exposure time, noise monitoring',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Heat stress in confined or hot environments',
      riskType: 'Personnel',
      mitigatingAction: 'Cooling systems, frequent breaks, hydration, heat stress monitoring',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Confined space entry hazards',
      riskType: 'Environmental',
      mitigatingAction: 'Atmospheric monitoring, ventilation, rescue equipment, attendant outside',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Fire or explosion from hot work',
      riskType: 'Process',
      mitigatingAction: 'Hot work permit, fire watch, remove combustibles, fire extinguishers ready',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Equipment failure causing production delays',
      riskType: 'Revenue',
      mitigatingAction: 'Preventive maintenance schedules, spare parts inventory, backup systems',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Supply chain disruption affecting operations',
      riskType: 'Revenue',
      mitigatingAction: 'Multiple supplier agreements, safety stock levels, alternative sourcing',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Regulatory compliance violations',
      riskType: 'Revenue',
      mitigatingAction: 'Regular compliance audits, staff training, documentation procedures',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Process control system failure',
      riskType: 'Process',
      mitigatingAction: 'Redundant control systems, manual override procedures, alarm systems',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Material handling system malfunction',
      riskType: 'Process',
      mitigatingAction: 'Emergency shutdown procedures, manual handling protocols, backup systems',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Quality control system failure',
      riskType: 'Process',
      mitigatingAction: 'Manual quality checks, backup testing procedures, hold protocols',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Environmental contamination from spills',
      riskType: 'Environmental',
      mitigatingAction: 'Spill containment systems, emergency response procedures, environmental monitoring',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Air quality degradation from operations',
      riskType: 'Environmental',
      mitigatingAction: 'Emission control systems, air monitoring, ventilation improvements',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Water pollution from process discharges',
      riskType: 'Environmental',
      mitigatingAction: 'Water treatment systems, discharge monitoring, containment measures',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Equipment maintenance causing extended downtime',
      riskType: 'Maintenance',
      mitigatingAction: 'Scheduled maintenance windows, quick-change procedures, backup equipment',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Inadequate maintenance leading to equipment failure',
      riskType: 'Maintenance',
      mitigatingAction: 'Preventive maintenance programs, condition monitoring, predictive maintenance',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Incorrect maintenance procedures',
      riskType: 'Maintenance',
      mitigatingAction: 'Standardized procedures, training programs, quality control checks',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Slip, trip, and fall hazards',
      riskType: 'Personnel',
      mitigatingAction: 'Housekeeping procedures, proper lighting, non-slip surfaces',
      mitigatingActionType: 'Control'
    },
    {
      riskDescription: 'Struck by moving equipment or objects',
      riskType: 'Personnel',
      mitigatingAction: 'Traffic control procedures, warning systems, exclusion zones',
      mitigatingActionType: 'Administrative'
    },
    {
      riskDescription: 'Manual handling injuries',
      riskType: 'Personnel',
      mitigatingAction: 'Mechanical lifting equipment, ergonomic design, training programs',
      mitigatingActionType: 'Control'
    }
  ];
  
  // Shuffle and select random risks
  const shuffledRisks = [...riskTemplates].sort(() => 0.5 - Math.random());
  
  for (let i = 0; i < numRisks; i++) {
    const template = shuffledRisks[i];
    const risk = generateRiskFromTemplate(template, requiresSupervisorSignature);
    risks.push(risk);
  }
  
  return risks;
}

/**
 * Generates a risk from a template with appropriate likelihood and consequence values
 */
function generateRiskFromTemplate(template, requiresSupervisorSignature) {
  let asIsLikelihood, asIsConsequence, mitigatedLikelihood, mitigatedConsequence;

  if (requiresSupervisorSignature) {
    asIsLikelihood = Math.floor(Math.random() * 2) + 4; // 4-5
    asIsConsequence = Math.floor(Math.random() * 3) + 3; // 3-5 
    mitigatedLikelihood = Math.floor(Math.random() * (asIsLikelihood - 3)) + 4; // 3-asIsLikelihood
    mitigatedConsequence = Math.floor(Math.random() * (asIsConsequence - 2)) + 3; // 3-asIsConsequence
  } else {
    asIsLikelihood = Math.floor(Math.random() * 3) + 1; // 1-3
    asIsConsequence = Math.floor(Math.random() * 3) + 1; // 1-3 
    mitigatedLikelihood = Math.floor(Math.random() * asIsLikelihood) + 1; // 1-asIsLikelihood
    mitigatedConsequence = Math.floor(Math.random() * asIsConsequence) + 1; // 1-asIsConsequence
  }
  
  // Convert to string equivalents
  const likelihoodMap = {
    1: 'Very Unlikely',
    2: 'Slight Chance',
    3: 'Feasible',
    4: 'Likely',
    5: 'Very Likely'
  };
  
  const consequenceMap = {
    1: 'Minor',
    2: 'Significant',
    3: 'Serious',
    4: 'Major',
    5: 'Catastrophic'
  };
  
  return {
    riskDescription: template.riskDescription,
    riskType: template.riskType,
    asIsLikelihood: likelihoodMap[asIsLikelihood],
    asIsConsequence: consequenceMap[asIsConsequence],
    mitigatingAction: template.mitigatingAction,
    mitigatingActionType: template.mitigatingActionType,
    mitigatedLikelihood: likelihoodMap[mitigatedLikelihood],
    mitigatedConsequence: consequenceMap[mitigatedConsequence],
    requiresSupervisorSignature: mitigatedLikelihood * mitigatedConsequence > 9
  };
}

/**
 * Generates a random date within the last 30 days
 */
function generateRandomDate() {
  const today = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const date = new Date(today);
  date.setDate(today.getDate() - daysAgo);
  
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

/**
 * Generates a random time
 */
function generateRandomTime() {
  const hours = Math.floor(Math.random() * 24).toString().padStart(2, '0');
  const minutes = Math.floor(Math.random() * 60).toString().padStart(2, '0');
  const seconds = Math.floor(Math.random() * 60).toString().padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Writes task hazards data to JSON file
 */
function writeTaskHazardsToJSON(taskHazards, outputPath) {
  // Write to file as JSON
  fs.writeFileSync(outputPath, JSON.stringify(taskHazards, null, 2));
}

/**
 * Checks if task hazards exist in database and adds them if needed
 */
async function checkAndAddTaskHazardsToDatabase(db, taskHazardDataPath) {
  try {
    // Read the JSON file
    const jsonContent = fs.readFileSync(taskHazardDataPath, 'utf8');
    const taskHazards = JSON.parse(jsonContent);
    
    if (taskHazards.length === 0) {
      return;
    }
    
    // Check if first task hazard exists in database
    const firstTaskHazard = taskHazards[0];
    const existingTaskHazard = await db.task_hazards.findOne({
      where: { 
        scopeOfWork: firstTaskHazard.scopeOfWork,
        date: firstTaskHazard.date
      }
    });
    
    if (existingTaskHazard) {
      return;
    }
        
    // Use the task hazards directly from JSON
    const taskHazardsToCreate = taskHazards.map(taskHazard => ({
      companyId: taskHazard.companyId,
      siteId: taskHazard.siteId,
      date: taskHazard.date,
      time: taskHazard.time,
      scopeOfWork: taskHazard.scopeOfWork,
      assetHierarchyId: taskHazard.assetSystem,
      systemLockoutRequired: taskHazard.systemLockoutRequired,
      trainedWorkforce: taskHazard.trainedWorkforce,
      individual: taskHazard.individual,
      supervisor: taskHazard.supervisor,
      location: taskHazard.location,
      status: taskHazard.status,
      geoFenceLimit: taskHazard.geoFenceLimit,
      risks: taskHazard.risks
    }));
    
    // Create task hazards using the controller
    const taskHazardController = require("../../../App/controllers/task_hazard.controller");
    let createdCount = 0;
    
    for (const taskHazardData of taskHazardsToCreate) {
      try {
        // Create mock request and response
        const req = createMockRequest(taskHazardData);
        const res = createMockResponse();
        
        // Call the controller's create method
        await taskHazardController.create(req, res);
        
        if (res.statusCode === 201) {
          createdCount++;
        } else {
          console.warn(`Failed to create task hazard: ${res.jsonData?.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.warn(`Error creating task hazard: ${error.message}`);
      }
    }
        
  } catch (error) {
    console.error("Error adding task hazards to database:", error);
  }
}

/**
 * Creates a mock request object for the task hazard controller
 */
function createMockRequest(taskHazardData) {
  return {
    user: {
      id: 1,
      company: {
        id: taskHazardData.companyId
      },
      company_id: taskHazardData.companyId,
      site_id: taskHazardData.siteId
    },
    body: {
      date: taskHazardData.date,
      time: taskHazardData.time,
      scopeOfWork: taskHazardData.scopeOfWork,
      assetSystem: taskHazardData.assetHierarchyId,
      systemLockoutRequired: taskHazardData.systemLockoutRequired,
      trainedWorkforce: taskHazardData.trainedWorkforce,
      individual: taskHazardData.individual,
      supervisor: taskHazardData.supervisor,
      location: taskHazardData.location,
      status: taskHazardData.status,
      geoFenceLimit: taskHazardData.geoFenceLimit,
      risks: taskHazardData.risks
    }
  };
}

/**
 * Creates a mock response object for the task hazard controller
 */
function createMockResponse() {
  const res = {
    statusCode: null,
    jsonData: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}



module.exports = {
  generateTaskHazardData,
  checkAndAddTaskHazardsToDatabase
}; 