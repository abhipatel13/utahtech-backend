const db = require("../models");
const AssetHierarchy = db.asset_hierarchy;
const TaskHazards = db.task_hazards;
const csv = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv');

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
      if (!asset.name) {
        validationErrors.push(`Asset at index ${index} is missing required field: name`);
      }
      if (!asset.cmmsInternalId) {
        validationErrors.push(`Asset at index ${index} is missing required field: cmmsInternalId`);
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
      // First, create all assets without parent relationships
      const assets = await Promise.all(
        req.body.assets.map(async (asset) => {
          // Generate a unique ID based on timestamp and cmmsInternalId
          const timestamp = Date.now();
          const uniqueId = `${asset.cmmsInternalId}-${timestamp}`;


          return AssetHierarchy.create({
            id: uniqueId,
            name: asset.name,
            description: asset.description || null,
            level: parseInt(asset.level) || 0,
            fmea: asset.fmea || null,
            actions: asset.actions || null,
            criticalityAssessment: asset.criticalityAssessment || null,
            inspectionPoints: asset.inspectionPoints || null,
            maintenancePlant: asset.maintenancePlant || null,
            cmmsInternalId: asset.cmmsInternalId,
            parent: asset.parent,
            cmmsSystem: asset.cmmsSystem || null,
            siteReferenceName: asset.siteReferenceName || null,
            functionalLocation: asset.functionalLocation || null,
            functionalLocationDesc: asset.functionalLocationDesc || null,
            functionalLocationLongDesc: asset.functionalLocationLongDesc || null,
            objectType: asset.objectType || null,
            systemStatus: asset.systemStatus || 'Active',
            make: asset.make || null,
            manufacturer: asset.manufacturer || null,
            serialNumber: asset.serialNumber || null
          }, { transaction: t });
        })
      );

      const assetMap = new Map(assets.map(asset => [asset.id, asset]));

      for (const asset of assets) {
        let level = 0;
        let currentParent = asset.parent;
        
        while (currentParent) {
          level++;
          const parentAsset = assetMap.get(currentParent);
          if (!parentAsset) break;
          currentParent = parentAsset.parent;
        }
        
        await asset.update({ level }, { transaction: t });
      }

      return assets;
    });

    res.status(201).json({
      status: true,
      message: "Asset Hierarchy created successfully",
      data: result
    });

  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while creating the Asset Hierarchy."
    });
  }
};

// Handle CSV file upload
exports.uploadCSV = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Parse CSV from buffer directly
    const csvString = req.file.buffer.toString('utf-8');
    const assets = csv.parse(csvString, {
      columns: true,
      skip_empty_lines: true
    });

    // First, remove all parent relationships
    await AssetHierarchy.update(
      { parent: null },
      { 
        where: {}, // Add empty where clause to update all records
        transaction: t 
      }
    );

    // Then delete all assets
    await AssetHierarchy.destroy({
      where: {},
      transaction: t
    });

    // Create all assets without parent relationships first
    const assetMap = new Map();
    const createdAssets = [];
    for (const asset of assets) {
      // Generate a unique ID based on timestamp and CMMS Internal ID
      const timestamp = Date.now();
      const uniqueId = `${asset['CMMS Internal ID']}-${timestamp}`;
      
      // Use Functional Location Description as name, or fallback to Functional Location
      const assetName = asset['Functional Location Description'] || asset['Functional Location'] || 'Unnamed Asset';

      const newAsset = await AssetHierarchy.create({
        id: uniqueId,
        name: assetName,
        maintenancePlant: asset['Maintenance Plant'] || null,
        cmmsInternalId: asset['CMMS Internal ID'] || null,
        functionalLocation: asset['Functional Location'] || null,
        parent: null, // Set parent to null initially
        cmmsSystem: asset['CMMS System'] || null,
        siteReferenceName: asset['Site Reference Name'] || null,
        functionalLocationDesc: asset['Functional Location Description'] || null,
        functionalLocationLongDesc: asset['Functional Location Long Description'] || null,
        objectType: asset['Object Type'] || null,
        systemStatus: asset['System Status'] || 'Active',
        make: asset['Make'] || null,
        manufacturer: asset['Manufacturer'] || null,
        serialNumber: asset['Serial Number'] || null,
        description: asset['Asset Description'] || asset['Functional Location Description'] || null,
        level: 1 // Set initial level
      }, { transaction: t });

      createdAssets.push(newAsset);
      // Store the asset in the map using functional location as key
      assetMap.set(asset['Functional Location'], newAsset);
    }

    // Update parent relationships
    for (const asset of assets) {
      const parentLocation = asset['Parent'];
      if (parentLocation && assetMap.has(parentLocation)) {
        const childAsset = assetMap.get(asset['Functional Location']);
        const parentAsset = assetMap.get(parentLocation);
        if (childAsset && parentAsset) {
          await childAsset.update({
            parent: parentAsset.id
          }, { 
            where: { id: childAsset.id },
            transaction: t 
          });
        }
      }
    }

    // Calculate levels based on parent relationships
    const calculateLevels = async (asset, level) => {
      await asset.update({ level }, { 
        where: { id: asset.id },
        transaction: t 
      });
      const children = await AssetHierarchy.findAll({
        where: { parent: asset.id },
        transaction: t
      });
      for (const child of children) {
        await calculateLevels(child, level + 1);
      }
    };

    // Start with root assets (those without parents)
    const rootAssets = await AssetHierarchy.findAll({
      where: { parent: null },
      transaction: t
    });

    for (const rootAsset of rootAssets) {
      await calculateLevels(rootAsset, 1);
    }

    // Fetch the final state of all assets with proper ordering
    const finalAssets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']],
      transaction: t
    });

    await t.commit();
    res.json({ 
      success: true, 
      message: 'CSV processed successfully',
      data: finalAssets
    });
  } catch (error) {
    await t.rollback();
    console.error('Error in uploadCSV:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Error processing CSV',
      error: error.message 
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