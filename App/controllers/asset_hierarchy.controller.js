const db = require("../models");
const AssetHierarchy = db.asset_hierarchy;
const csv = require('csv-parse/sync');

// Create and Save new Asset Hierarchy entries
exports.create = async (req, res) => {
  try {
    // Validate request
    if (!req.body.assets || !Array.isArray(req.body.assets)) {
      return res.status(400).json({
        status: false,
        message: "Assets array is required"
      });
    }

    // Validate each asset
    const validationErrors = [];
    req.body.assets.forEach((asset, index) => {
      if (!asset.id || !asset.name) {
        validationErrors.push(`Asset at index ${index} is missing required fields (id, name)`);
      }
      if (asset.level === undefined || isNaN(asset.level)) {
        validationErrors.push(`Asset at index ${index} has invalid level value`);
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Create all assets
      const assets = await Promise.all(
        req.body.assets.map(asset => 
          AssetHierarchy.create({
            id: asset.id,
            name: asset.name,
            description: asset.description || null,
            parent: asset.parent || null,
            level: parseInt(asset.level) || 0,
            fmea: asset.fmea || null,
            actions: asset.actions || null,
            criticalityAssessment: asset.criticalityAssessment || null,
            inspectionPoints: asset.inspectionPoints || null
          }, { transaction: t })
        )
      );

      return assets;
    });

    res.status(201).json({
      status: true,
      message: "Asset Hierarchy created successfully",
      data: result
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while creating the Asset Hierarchy."
    });
  }
};

// Handle CSV file upload
exports.uploadCSV = async (req, res) => {
  console.log('Upload CSV request received');
  try {
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Please upload a CSV file!"
      });
    }

    const csvString = req.file.buffer.toString('utf8');
    
    // Parse CSV using csv-parse
    const records = csv.parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      skip_records_with_empty_values: true
    });

    if (records.length === 0) {
      return res.status(400).json({
        status: false,
        message: "CSV file is empty"
      });
    }

    // Validate headers
    const requiredFields = [
      'Functional Location',
      'Functional Location Description',
      'CMMS Internal ID'
    ];
    
    const firstRecord = records[0];
    const missingFields = requiredFields.filter(field => !(field in firstRecord));

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Missing required columns: ${missingFields.join(', ')}`
      });
    }

    // Filter out header description rows
    const validRecords = records.filter(record => {
      return record['Maintenance Plant'] !== 'AH_FLOC_MAINT_PLNT_C' && 
             record['Maintenance Plant'] !== 'System generated from last number';
    });

    // Process records
    const assets = validRecords.map(record => ({
      id: record['Functional Location'],
      name: record['Functional Location Description'],
      description: record['Functional Location Long Description'] || record['Functional Location Description'],
      parent: record['Parent'] || null,
      maintenancePlant: record['Maintenance Plant'] || '',
      internalId: record['CMMS Internal ID'] || '',
      primaryKey: record['Primay Key'] || '',
      cmmsSystem: record['CMMS System'] || '',
      siteReference: record['Site Reference Name'] || '',
      objectType: record['Object Type (Taxonomy Mapping Value)'] || '',
      systemStatus: record['System Status'] || 'Active',
      make: record['Make'] || '',
      manufacturer: record['Manufacturer'] || '',
      serialNumber: record['Serial Number'] || '',
      level: 0 // Will be calculated
    }));

    // Calculate levels
    const parentMap = new Map();
    assets.forEach(asset => {
      if (asset.parent) {
        parentMap.set(asset.id, asset.parent);
      }
    });

    assets.forEach(asset => {
      let level = 0;
      let currentParent = asset.parent;
      while (currentParent) {
        level++;
        currentParent = parentMap.get(currentParent);
        // Prevent infinite loops from circular references
        if (level > 100) {
          throw new Error(`Circular reference detected in hierarchy for asset ${asset.id}`);
        }
      }
      asset.level = level;
    });

    // Validate parent references
    const assetIds = new Set(assets.map(a => a.id));
    const invalidParents = assets.filter(asset => 
      asset.parent && !assetIds.has(asset.parent)
    );
    
    if (invalidParents.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Invalid parent references found: ${invalidParents.map(a => `${a.id} -> ${a.parent}`).join(', ')}`
      });
    }

    // Start transaction
    const t = await db.sequelize.transaction();

    try {
      // Delete existing assets
      await AssetHierarchy.destroy({ 
        where: {},
        truncate: true,
        cascade: true,
        transaction: t 
      });

      // Create new assets
      const createdAssets = await Promise.all(
        assets.map(asset => 
          AssetHierarchy.create(asset, { transaction: t })
        )
      );

      await t.commit();

      res.status(200).json({
        status: true,
        message: "Assets uploaded successfully",
        data: createdAssets
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error processing CSV:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while processing the CSV file."
    });
  }
};

// Retrieve all Asset Hierarchy entries
exports.findAll = async (req, res) => {
  try {
    const assets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']]
    });
    
    res.status(200).json({
      status: true,
      data: assets
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while retrieving asset hierarchy."
    });
  }
};

// Find a single Asset Hierarchy entry with an id
exports.findOne = async (req, res) => {
  try {
    const asset = await AssetHierarchy.findByPk(req.params.id, {
      include: [{
        model: AssetHierarchy,
        as: 'children',
        include: [{
          model: AssetHierarchy,
          as: 'children'
        }]
      }]
    });

    if (!asset) {
      return res.status(404).json({
        status: false,
        message: "Asset not found"
      });
    }

    res.status(200).json({
      status: true,
      data: asset
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Error retrieving Asset with id " + req.params.id
    });
  }
}; 