const fs = require('fs');
const path = require('path');

/**
 * Generates asset hierarchy data for each company
 */
async function generateAssetData(companies, outputPath) {
  const assets = [];
  let assetCounter = 1; // Global counter for unique IDs
  
  for (const company of companies) {
    // Get company data from JSON to access locations and maintenance plants
    const companiesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/companies.json'), 'utf8')
    );
    const companyData = companiesData.find(c => c.name === company.name);
    
    if (!companyData) {
      console.warn(`Company data not found for: ${company.name}`);
      continue;
    }
    
    // Generate assets for each location (facility)
    for (const location of companyData.locations) {
      const locationAssets = generateLocationAssets(company, location, companyData.cmms, assetCounter);
      assets.push(...locationAssets);
      assetCounter += locationAssets.length; // Increment counter by number of assets generated
    }
  }
  
  // Ensure the generated directory exists
  const generatedDir = path.dirname(outputPath);
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  
  // Write asset data to CSV file
  writeAssetsToCSV(assets, outputPath);
  
  return assets;
}

/**
 * Writes assets data to CSV file
 */
function writeAssetsToCSV(assets, outputPath) {
  const csvHeaders = [
    'id', 'company_id', 'name', 'cmms_internal_id', 'functional_location',
    'functional_location_desc', 'functional_location_long_desc', 'parent_id',
    'maintenance_plant', 'cmms_system', 'object_type', 'make', 'manufacturer',
    'serial_number', 'level'
  ];
  
  // Create CSV content
  let csvContent = csvHeaders.join(',') + '\n';
  
  assets.forEach(asset => {
    const row = [
      asset.id,
      asset.companyId,
      `"${asset.name}"`,
      asset.cmmsInternalId,
      `"${asset.functionalLocation}"`,
      `"${asset.functionalLocationDesc}"`,
      `"${asset.functionalLocationLongDesc}"`,
      asset.parent || '',
      `"${asset.maintenancePlant}"`,
      asset.cmmsSystem,
      asset.objectType,
      asset.make || '',
      asset.manufacturer || '',
      asset.serialNumber || '',
      asset.level
    ];
    csvContent += row.join(',') + '\n';
  });
  
  // Write to file
  fs.writeFileSync(outputPath, csvContent);
}

/**
 * Generates asset hierarchy for a specific location (facility)
 */
function generateLocationAssets(company, location, cmmsSystem, startCounter) {
  const assets = [];
  let counter = startCounter;
  
  // Plant level asset - use location name (the actual facility)
  const plantAsset = {
    id: `${cmmsSystem}_PLANT_${counter}`,
    companyId: company.id,
    name: location.name,
    cmmsInternalId: `${cmmsSystem}`,
    functionalLocation: `${location.name}`,
    functionalLocationDesc: location.locationDesc || location.name,
    functionalLocationLongDesc: location.locationLongDesc || `${location.name} facility`,
    parent: null,
    maintenancePlant: location.maintenancePlants[0]?.name || location.name, 
    cmmsSystem: cmmsSystem,
    objectType: 'FACILITY',
    level: 0
  };
  assets.push(plantAsset);
  counter++;
  
  // Area level assets (3-5 areas per facility)
  const numAreas = Math.floor(Math.random() * 3) + 3; // 3-5 areas
  const areaTypes = ['PROCESSING', 'STORAGE', 'UTILITIES', 'MAINTENANCE', 'ADMIN'];
  
  for (let i = 0; i < numAreas; i++) {
    const areaType = areaTypes[i] || 'AREA';
    const areaAsset = {
      id: `${cmmsSystem}_${areaType}_${counter}`,
      companyId: company.id,
      name: `${areaType} Area ${i + 1}`,
      cmmsInternalId: `${cmmsSystem}_AREA_${String(i + 1).padStart(3, '0')}`,
      functionalLocation: `${cmmsSystem}-AREA-${areaType}-${String(i + 1).padStart(2, '0')}`,
      functionalLocationDesc: `${areaType} Area ${i + 1} - ${location.locationDesc || location.name}`,
      functionalLocationLongDesc: `${areaType} Area ${i + 1} - ${location.locationLongDesc}`,
      parent: plantAsset.id,
      maintenancePlant: location.maintenancePlants[0]?.name || location.name,
      cmmsSystem: cmmsSystem,
      objectType: 'AREA',
      level: 1
    };
    assets.push(areaAsset);
    counter++;
    
    // Equipment level assets (2-4 pieces per area)
    const numEquipment = Math.floor(Math.random() * 3) + 2; // 2-4 equipment
    const equipmentTypes = ['Excavator', 'Dump Truck', 'Bulldozer', 'Loader', 'Drill Rig', 'Crusher', 'Conveyor System', 'Generator'];
    
    for (let j = 0; j < numEquipment; j++) {
      const equipmentType = equipmentTypes[Math.floor(Math.random() * equipmentTypes.length)];
      const equipmentAsset = {
        id: `${cmmsSystem}_${equipmentType}_${counter}`,
        companyId: company.id,
        name: `${equipmentType} ${i + 1}-${j + 1}`,
        cmmsInternalId: `${cmmsSystem}_EQ_${String(i + 1).padStart(2, '0')}_${String(j + 1).padStart(2, '0')}`,
        functionalLocation: `${cmmsSystem}-EQ-${equipmentType}-${String(i + 1).padStart(2, '0')}-${String(j + 1).padStart(2, '0')}`,
        functionalLocationDesc: `${equipmentType} ${i + 1}-${j + 1} - ${areaType} Area ${i + 1}`,
        functionalLocationLongDesc: `${equipmentType} ${i + 1}-${j + 1} - ${areaType} Area ${i + 1} - ${location.locationLongDesc}`,
        parent: areaAsset.id,
        maintenancePlant: location.maintenancePlants[0]?.name || location.name,
        cmmsSystem: cmmsSystem,
        objectType: 'HEAVY_MACHINERY',
        make: generateRandomMake(),
        manufacturer: generateRandomManufacturer(),
        serialNumber: generateRandomSerialNumber(),
        level: 2
      };
      assets.push(equipmentAsset);
      counter++;
      
      // Generate major components for equipment (Level 3)
      const majorComponents = generateMajorComponents(equipmentType, equipmentAsset, cmmsSystem, counter);
      assets.push(...majorComponents);
      counter += majorComponents.length;
    }
  }
  
  return assets;
}

/**
 * Generates major components for equipment (Level 3)
 */
function generateMajorComponents(equipmentType, parentAsset, cmmsSystem, startCounter) {
  const components = [];
  let counter = startCounter;
  const componentMap = {
    'Excavator': ['Hydraulic System', 'Engine', 'Undercarriage', 'Cab Assembly', 'Boom Assembly'],
    'Dump Truck': ['Engine', 'Transmission', 'Hydraulic System', 'Dump Body', 'Braking System'],
    'Bulldozer': ['Engine', 'Blade Assembly', 'Track System', 'Hydraulic System', 'Cab'],
    'Loader': ['Engine', 'Bucket Assembly', 'Hydraulic System', 'Transmission', 'Axles'],
    'Drill Rig': ['Drill Head Assembly', 'Compressor', 'Engine', 'Mast', 'Control System'],
    'Crusher': ['Jaw Assembly', 'Motor', 'Conveyor Belt', 'Lubrication System', 'Control Panel'],
    'Conveyor System': ['Belt', 'Drive Motor', 'Roller Assembly', 'Tensioning System', 'Control System'],
    'Generator': ['Engine', 'Alternator', 'Control Panel', 'Cooling System', 'Fuel System']
  };
  
  const possibleComponents = componentMap[equipmentType] || ['Engine', 'Control System', 'Hydraulic System'];
  const numComponents = Math.floor(Math.random() * 3) + 2; // 2-4 components
  const selectedComponents = possibleComponents.slice(0, numComponents);
  
  selectedComponents.forEach((componentType, index) => {
    const componentAsset = {
      id: `${cmmsSystem}_${parentAsset.name.replace(/\s+/g, '_')}_${componentType.replace(/\s+/g, '_')}_${counter}`,
      companyId: parentAsset.companyId,
      name: componentType,
      cmmsInternalId: `${cmmsSystem}_COMP_${String(counter).padStart(6, '0')}`,
      functionalLocation: `${cmmsSystem}-COMP-${componentType.replace(/\s+/g, '-')}-${String(counter).padStart(6, '0')}`,
      functionalLocationDesc: `${componentType} - ${parentAsset.name}`,
      functionalLocationLongDesc: `${componentType} - ${parentAsset.name} - ${parentAsset.functionalLocationLongDesc}`,
      parent: parentAsset.id,
      maintenancePlant: parentAsset.maintenancePlant,
      cmmsSystem: cmmsSystem,
      objectType: 'MAJOR_COMPONENT',
      make: generateRandomMake(),
      manufacturer: generateRandomManufacturer(),
      serialNumber: generateRandomSerialNumber(),
      level: 3
    };
    components.push(componentAsset);
    counter++;
    
    // Generate sub-assemblies for major components (Level 4)
    const subAssemblies = generateSubAssemblies(componentType, componentAsset, cmmsSystem, counter);
    components.push(...subAssemblies);
    counter += subAssemblies.length;
  });
  
  return components;
}

/**
 * Generates sub-assemblies for major components (Level 4)
 */
function generateSubAssemblies(componentType, parentAsset, cmmsSystem, startCounter) {
  const subAssemblies = [];
  let counter = startCounter;
  const subAssemblyMap = {
    'Hydraulic System': ['Main Pump', 'Control Valve', 'Hydraulic Tank', 'Filter Assembly', 'Pressure Lines'],
    'Engine': ['Cylinder Block', 'Fuel System', 'Cooling System', 'Electrical System', 'Exhaust System'],
    'Transmission': ['Torque Converter', 'Gear Box', 'Control Module', 'Oil Cooler', 'Clutch Assembly'],
    'Undercarriage': ['Track Chain', 'Drive Sprocket', 'Idler Wheel', 'Track Frame', 'Grease Points'],
    'Boom Assembly': ['Boom Arm', 'Stick', 'Bucket Cylinder', 'Boom Cylinder', 'Pin Joints'],
    'Blade Assembly': ['Blade', 'Cutting Edge', 'Tilt Cylinder', 'Lift Cylinder', 'Side Frames'],
    'Bucket Assembly': ['Bucket Shell', 'Cutting Edge', 'Side Cutters', 'Bucket Cylinder', 'Pin Joints'],
    'Drive Motor': ['Motor Housing', 'Rotor', 'Stator', 'Bearings', 'Motor Controller'],
    'Control Panel': ['Display Unit', 'Control Board', 'Wiring Harness', 'Switches', 'Indicators']
  };
  
  const possibleSubAssemblies = subAssemblyMap[componentType] || ['Main Unit', 'Control System', 'Support Structure'];
  const numSubAssemblies = Math.floor(Math.random() * 3) + 1; // 1-3 sub-assemblies
  const selectedSubAssemblies = possibleSubAssemblies.slice(0, numSubAssemblies);
  
  selectedSubAssemblies.forEach((subAssemblyType, index) => {
    const subAssemblyAsset = {
      id: `${cmmsSystem}_${parentAsset.name.replace(/\s+/g, '_')}_${subAssemblyType.replace(/\s+/g, '_')}_${counter}`,
      companyId: parentAsset.companyId,
      name: subAssemblyType,
      cmmsInternalId: `${cmmsSystem}_SUB_${String(counter).padStart(6, '0')}`,
      functionalLocation: `${cmmsSystem}-SUB-${subAssemblyType.replace(/\s+/g, '-')}-${String(counter).padStart(6, '0')}`,
      functionalLocationDesc: `${subAssemblyType} - ${parentAsset.name}`,
      functionalLocationLongDesc: `${subAssemblyType} - ${parentAsset.name} - ${parentAsset.functionalLocationLongDesc}`,
      parent: parentAsset.id,
      maintenancePlant: parentAsset.maintenancePlant,
      cmmsSystem: cmmsSystem,
      objectType: 'SUB_ASSEMBLY',
      make: generateRandomMake(),
      manufacturer: generateRandomManufacturer(),
      serialNumber: generateRandomSerialNumber(),
      level: 4
    };
    subAssemblies.push(subAssemblyAsset);
    counter++;
    
    // Generate components for sub-assemblies (Level 5)
    const components = generateComponents(subAssemblyType, subAssemblyAsset, cmmsSystem, counter);
    subAssemblies.push(...components);
    counter += components.length;
  });
  
  return subAssemblies;
}

/**
 * Generates components for sub-assemblies (Level 5)
 */
function generateComponents(subAssemblyType, parentAsset, cmmsSystem, startCounter) {
  const components = [];
  let counter = startCounter;
  const componentMap = {
    'Main Pump': ['Pump Housing', 'Impeller', 'Shaft', 'Seals', 'Bearing Assembly'],
    'Control Valve': ['Valve Body', 'Spool', 'Springs', 'Seals', 'Actuator'],
    'Cylinder Block': ['Pistons', 'Connecting Rods', 'Crankshaft', 'Head Assembly', 'Oil Pan'],
    'Fuel System': ['Fuel Pump', 'Fuel Injectors', 'Fuel Lines', 'Fuel Filter', 'Fuel Tank'],
    'Cooling System': ['Radiator', 'Water Pump', 'Thermostat', 'Cooling Fan', 'Hoses'],
    'Electrical System': ['Alternator', 'Starter Motor', 'Battery', 'Wiring Harness', 'ECU'],
    'Gear Box': ['Input Shaft', 'Output Shaft', 'Gears', 'Synchronizers', 'Housing'],
    'Motor Housing': ['Front Cover', 'Rear Cover', 'Frame', 'Terminal Box', 'Mounting Feet'],
    'Display Unit': ['LCD Screen', 'Backlight', 'Touch Panel', 'Control Circuit', 'Housing']
  };
  
  const possibleComponents = componentMap[subAssemblyType] || ['Main Unit', 'Control Element', 'Support Structure'];
  const numComponents = Math.floor(Math.random() * 2) + 1; // 1-2 components
  const selectedComponents = possibleComponents.slice(0, numComponents);
  
  selectedComponents.forEach((componentType, index) => {
    const componentAsset = {
      id: `${cmmsSystem}_${parentAsset.name.replace(/\s+/g, '_')}_${componentType.replace(/\s+/g, '_')}_${counter}`,
      companyId: parentAsset.companyId,
      name: componentType,
      cmmsInternalId: `${cmmsSystem}_COMP_${String(counter).padStart(6, '0')}`,
      functionalLocation: `${cmmsSystem}-COMP-${componentType.replace(/\s+/g, '-')}-${String(counter).padStart(6, '0')}`,
      functionalLocationDesc: `${componentType} - ${parentAsset.name}`,
      functionalLocationLongDesc: `${componentType} - ${parentAsset.name} - ${parentAsset.functionalLocationLongDesc}`,
      parent: parentAsset.id,
      maintenancePlant: parentAsset.maintenancePlant,
      cmmsSystem: cmmsSystem,
      objectType: 'COMPONENT',
      make: generateRandomMake(),
      manufacturer: generateRandomManufacturer(),
      serialNumber: generateRandomSerialNumber(),
      level: 5
    };
    components.push(componentAsset);
    counter++;
  });
  
  return components;
}

/**
 * Generates random equipment makes
 */
function generateRandomMake() {
  const makes = ['Caterpillar', 'Komatsu', 'Hitachi', 'Liebherr', 'Volvo', 'John Deere', 'Case', 'New Holland'];
  return makes[Math.floor(Math.random() * makes.length)];
}

/**
 * Generates random equipment manufacturers
 */
function generateRandomManufacturer() {
  const manufacturers = ['Caterpillar Inc.', 'Komatsu Ltd.', 'Hitachi Construction Machinery', 'Liebherr Group', 'Volvo Construction Equipment', 'Deere & Company', 'CNH Industrial', 'Kubota Corporation'];
  return manufacturers[Math.floor(Math.random() * manufacturers.length)];
}

/**
 * Generates random serial numbers
 */
function generateRandomSerialNumber() {
  const prefix = 'SN';
  const randomNum = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  const year = new Date().getFullYear().toString().slice(-2);
  return `${prefix}${year}${randomNum}`;
}

/**
 * Checks if assets exist in database and adds them if needed
 */
async function checkAndAddAssetsToDatabase(db, assetDataPath) {
  try {
    // Read the CSV file
    const csvContent = fs.readFileSync(assetDataPath, 'utf8');
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) {
      console.log("No asset data found in CSV file.");
      return;
    }
    
    // Parse headers
    const headers = lines[0].split(',');
    
    // Parse first asset to check if it exists
    const firstAssetLine = lines[1];
    const firstAssetData = parseCSVLine(firstAssetLine);
    const firstAssetId = firstAssetData[headers.indexOf('id')];
    
    // Check if first asset exists in database
    const existingAsset = await db.asset_hierarchy.findOne({
      where: { id: firstAssetId }
    });
    
    if (existingAsset) {
      console.log("Assets already exist in database, skipping import.");
      return;
    }
    
    console.log("Adding assets to database...");
    
    // Parse all assets from CSV
    const assetsToCreate = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const assetData = parseCSVLine(lines[i]);
        const asset = {
          id: assetData[headers.indexOf('id')],
          companyId: parseInt(assetData[headers.indexOf('company_id')]),
          name: assetData[headers.indexOf('name')].replace(/"/g, ''),
          cmmsInternalId: assetData[headers.indexOf('cmms_internal_id')],
          functionalLocation: assetData[headers.indexOf('functional_location')].replace(/"/g, ''),
          functionalLocationDesc: assetData[headers.indexOf('functional_location_desc')].replace(/"/g, ''),
          functionalLocationLongDesc: assetData[headers.indexOf('functional_location_long_desc')].replace(/"/g, ''),
          parent: assetData[headers.indexOf('parent_id')] || null,
          maintenancePlant: assetData[headers.indexOf('maintenance_plant')].replace(/"/g, ''),
          cmmsSystem: assetData[headers.indexOf('cmms_system')],
          objectType: assetData[headers.indexOf('object_type')],
          make: assetData[headers.indexOf('make')] || null,
          manufacturer: assetData[headers.indexOf('manufacturer')] || null,
          serialNumber: assetData[headers.indexOf('serial_number')] || null,
          level: parseInt(assetData[headers.indexOf('level')])
        };
        assetsToCreate.push(asset);
      }
    }
    
    // Bulk create all assets
    if (assetsToCreate.length > 0) {
      await db.asset_hierarchy.bulkCreate(assetsToCreate);
      console.log(`Successfully added ${assetsToCreate.length} assets to database.`);
    }
    
  } catch (error) {
    console.error("Error adding assets to database:", error);
  }
}

/**
 * Parses a CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

module.exports = {
  generateAssetData,
  checkAndAddAssetsToDatabase
}; 