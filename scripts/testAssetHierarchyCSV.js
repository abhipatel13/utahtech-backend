const db = require("../App/models");
const AssetHierarchy = db.asset_hierarchy;
const csv = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

/**
 * Test script to verify asset hierarchy CSV upload
 * Compares database entries with CSV file for a specific company
 */

async function testAssetHierarchyCSV(csvFilePath, companyId) {
  try {
    console.log(`\n=== Testing Asset Hierarchy CSV Upload ===`);
    console.log(`CSV File: ${csvFilePath}`);
    console.log(`Company ID: ${companyId}`);
    console.log(`=======================================\n`);

    // Check if CSV file exists
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    // Read and parse CSV file
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
    const csvAssets = csv.parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`CSV contains ${csvAssets.length} assets\n`);

    // Validate CSV structure
    const expectedColumns = ['id', 'name', 'functional_location', 'functional_location_desc', 'cmms_internal_id', 'parent_id', 'level', 'object_type', 'system_status', 'make', 'manufacturer', 'serial_number'];
    const csvColumns = Object.keys(csvAssets[0] || {});
    
    console.log('Validating CSV structure...');
    const missingColumns = expectedColumns.filter(col => !csvColumns.includes(col));
    if (missingColumns.length > 0) {
      console.log(`Missing required columns: ${missingColumns.join(', ')}`);
      return false;
    }
    console.log('CSV structure is valid\n');

    // Get database entries for the company
    const dbAssets = await AssetHierarchy.findAll({
      where: { companyId: companyId },
      order: [['level', 'ASC'], ['name', 'ASC']]
    });

    console.log(`Database contains ${dbAssets.length} assets for company ${companyId}\n`);

    // Create maps for comparison
    const csvMap = new Map();
    const dbMap = new Map();

    // Process CSV assets
    csvAssets.forEach((asset, index) => {
      const key = asset.id || `row_${index}`;
      csvMap.set(key, {
        name: asset.name?.trim() || '',
        functionalLocation: asset.functional_location?.trim() || '',
        functionalLocationDesc: asset.functional_location_desc?.trim() || '',
        functionalLocationLongDesc: asset.functional_location_long_desc?.trim() || asset.functional_location_desc?.trim() || '',
        cmmsInternalId: asset.cmms_internal_id?.trim() || '',
        maintenancePlant: asset.maintenance_plant?.trim() || 'Default Plant',
        cmmsSystem: asset.cmms_system?.trim() || 'Default System',
        objectType: asset.object_type?.trim() || 'Equipment',
        systemStatus: asset.system_status?.trim() || 'Active',
        make: asset.make?.trim() || null,
        manufacturer: asset.manufacturer?.trim() || null,
        serialNumber: asset.serial_number?.trim() || null,
        parentId: asset.parent_id?.trim() || null
      });
    });

    // Process DB assets
    dbAssets.forEach(asset => {
      const key = asset.id;
      dbMap.set(key, {
        name: asset.name || '',
        functionalLocation: asset.functionalLocation || '',
        functionalLocationDesc: asset.functionalLocationDesc || '',
        functionalLocationLongDesc: asset.functionalLocationLongDesc || '',
        cmmsInternalId: asset.cmmsInternalId || '',
        maintenancePlant: asset.maintenancePlant || '',
        cmmsSystem: asset.cmmsSystem || '',
        objectType: asset.objectType || '',
        systemStatus: asset.systemStatus || '',
        make: asset.make || null,
        manufacturer: asset.manufacturer || null,
        serialNumber: asset.serialNumber || null,
        parentId: asset.parent || null,
        level: asset.level,
        id: asset.id
      });
    });

    // Compare data
    console.log('Comparison Results:\n');
    
    let matches = 0;
    let mismatches = 0;
    let missingInDb = 0;
    let extraInDb = 0;

    // Check CSV assets against DB
    for (const [key, csvAsset] of csvMap) {
      if (!dbMap.has(key)) {
        console.log(`Missing in DB: ${key} (${csvAsset.name})`);
        missingInDb++;
        continue;
      }

      const dbAsset = dbMap.get(key);
      const differences = [];

      // Compare each field
      const fieldsToCompare = [
        'name', 'functionalLocation', 'functionalLocationDesc', 
        'functionalLocationLongDesc', 'maintenancePlant', 'cmmsSystem',
        'objectType', 'systemStatus', 'make', 'manufacturer', 
        'serialNumber', 'parentId'
      ];

      fieldsToCompare.forEach(field => {
        const csvValue = csvAsset[field];
        const dbValue = dbAsset[field];
        
        // Handle null/empty string comparison
        const normalizedCsvValue = csvValue === null || csvValue === '' ? null : csvValue;
        const normalizedDbValue = dbValue === null || dbValue === '' ? null : dbValue;
        
        if (normalizedCsvValue !== normalizedDbValue) {
          differences.push(`${field}: CSV="${csvValue}" vs DB="${dbValue}"`);
        }
      });

      if (differences.length > 0) {
        console.log(`Mismatch for ${key} (${csvAsset.name}):`);
        differences.forEach(diff => console.log(`   ${diff}`));
        console.log(`   DB ID: ${dbAsset.id}, Level: ${dbAsset.level}\n`);
        mismatches++;
      } else {
        matches++;
      }
    }

    // Check for assets in DB but not in CSV
    for (const [key, dbAsset] of dbMap) {
      if (!csvMap.has(key)) {
        console.log(`Extra in DB: ${key} (${dbAsset.name}) - ID: ${dbAsset.id}`);
        extraInDb++;
      }
    }

    console.log('\nSummary:');
    console.log(`Matches: ${matches}`);
    console.log(`Mismatches: ${mismatches}`);
    console.log(`Missing in DB: ${missingInDb}`);
    console.log(`Extra in DB: ${extraInDb}`);
    
    const totalCsvAssets = csvMap.size;
    const totalDbAssets = dbMap.size;
    console.log(`\nTotals: CSV=${totalCsvAssets}, DB=${totalDbAssets}`);

    // Test result
    const testPassed = mismatches === 0 && missingInDb === 0;
    console.log(`\nTest Result: ${testPassed ? 'PASSED' : 'FAILED'}`);
    
    if (testPassed && extraInDb === 0) {
      console.log('Perfect match! CSV and Database are in sync.');
    } else if (testPassed) {
      console.log('All CSV entries are correctly in the database.');
      if (extraInDb > 0) {
        console.log('Note: Database contains additional entries not in CSV (this may be expected).');
      }
    }

    return testPassed;

  } catch (error) {
    console.error('Error running test:', error.message);
    return false;
  }
}

async function runTest() {
    console.log('Running Asset Hierarchy CSV Test Example\n');
    
    // Path to the existing CSV file in the controllers directory
    // const csvFilePath = path.join(__dirname, '../scripts/testData/asset_test_data_1_n48.csv');
    // const csvFilePath = path.join(__dirname, '../scripts/testData/asset_test_data_3_n106.csv');
    const csvFilePath = path.join(__dirname, '../scripts/testData/asset_test_data_2_3_merged_n147.csv');
    const companyId = 1;
    
    console.log(`Using CSV file: ${csvFilePath}`);
    console.log(`Testing for company ID: ${companyId}\n`);
    
    try {
      const result = await testAssetHierarchyCSV(csvFilePath, companyId);
      
      if (result) {
        console.log('\nTest completed successfully!');
      } else {
        console.log('\nTest found discrepancies. Check the output above for details.');
      }
      
    } catch (error) {
      console.error('\nTest failed with error:', error.message);
    }
  }

module.exports = { testAssetHierarchyCSV, runTest }; 