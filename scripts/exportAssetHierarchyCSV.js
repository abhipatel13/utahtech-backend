const db = require("../App/models");
const AssetHierarchy = db.asset_hierarchy;
const fs = require('fs');
const path = require('path');

/**
 * Export asset hierarchy data from database to CSV format
 */

async function exportAssetHierarchyCSV(companyId, outputPath) {
  try {
    console.log(`\n=== Exporting Asset Hierarchy to CSV ===`);
    console.log(`Company ID: ${companyId}`);
    console.log(`Output Path: ${outputPath}`);
    console.log(`=====================================\n`);

    // Get all assets for the company
    const assets = await AssetHierarchy.findAll({
      where: { companyId: companyId },
      order: [['level', 'ASC'], ['name', 'ASC']]
    });

    console.log(`Found ${assets.length} assets for company ${companyId}`);

    if (assets.length === 0) {
      console.log('No assets found for this company');
      return false;
    }

    // Create CSV header
    const headers = [
      'name',
      'functional_location', 
      'functional_location_desc',
      'functional_location_long_desc',
      'cmms_internal_id',
      'maintenance_plant',
      'cmms_system',
      'object_type',
      'system_status',
      'make',
      'manufacturer',
      'serial_number',
      'parent_id'
    ];

    // Create CSV content
    let csvContent = headers.join(',') + '\n';

    // Add data rows
    assets.forEach(asset => {
      const row = [
        escapeCSVField(asset.name || ''),
        escapeCSVField(asset.functionalLocation || ''),
        escapeCSVField(asset.functionalLocationDesc || ''),
        escapeCSVField(asset.functionalLocationLongDesc || ''),
        escapeCSVField(asset.cmmsInternalId || ''),
        escapeCSVField(asset.maintenancePlant || ''),
        escapeCSVField(asset.cmmsSystem || ''),
        escapeCSVField(asset.objectType || ''),
        escapeCSVField(asset.systemStatus || ''),
        escapeCSVField(asset.make || ''),
        escapeCSVField(asset.manufacturer || ''),
        escapeCSVField(asset.serialNumber || ''),
        escapeCSVField(asset.parent || '')
      ];
      
      csvContent += row.join(',') + '\n';
    });

    // Write to file
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    
    console.log(`Successfully exported ${assets.length} assets to ${outputPath}`);
    
    return true;

  } catch (error) {
    console.error('Error exporting CSV:', error.message);
    return false;
  }
}

// Helper function to escape CSV fields
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If field contains comma, newline, or double quote, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}

// Command line usage - 'node exportAssetHierarchyCSV.js <company-id> [output-path]'
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('\n Company ID is required');
    process.exit(1);
  }

  const companyId = parseInt(args[0]);
  
  if (isNaN(companyId)) {
    console.error('Company ID must be a valid number');
    process.exit(1);
  }

  // Default output path if not provided
  let outputPath = args[1];
  if (!outputPath) {
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    outputPath = path.join(exportsDir, `asset_hierarchy_company_${companyId}.csv`);
  }

  try {
    const result = await exportAssetHierarchyCSV(companyId, outputPath);
    process.exit(result ? 0 : 1);
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    if (db.sequelize) {
      await db.sequelize.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { exportAssetHierarchyCSV, escapeCSVField }; 