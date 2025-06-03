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

    // Create file upload record
    const fileUpload = await db.file_uploads.create({
      fileName: req.file.filename || `${Date.now()}-${req.file.originalname}`,
      originalName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      company: req.user.company,
      status: 'uploading'  // Explicitly set initial status
    }, { 
      transaction: t,
      fields: ['fileName', 'originalName', 'fileType', 'fileSize', 'uploadedBy', 'company', 'status']
    });

    // Parse CSV from buffer directly
    const csvString = req.file.buffer.toString('utf-8');
    const assets = csv.parse(csvString, {
      columns: true,
      skip_empty_lines: true
    });

    // Find all assets that are referenced by task hazards
    const referencedAssets = await TaskHazards.findAll({
      attributes: ['assetSystem'],
      group: ['assetSystem'],
      transaction: t
    });

    const referencedAssetIds = new Set(referencedAssets.map(a => a.assetSystem));

    // Get all existing assets
    const existingAssets = await AssetHierarchy.findAll({
      transaction: t
    });

    const existingAssetMap = new Map(existingAssets.map(asset => [asset.id, asset]));

    // Create a map for the new assets from CSV
    const newAssetMap = new Map();
    for (const asset of assets) {
      const functionalLocation = asset['Functional Location'];
      if (!functionalLocation) {
        throw new Error('Functional Location is required for all assets');
      }

      newAssetMap.set(functionalLocation, {
        id: functionalLocation,
        name: asset['Description'] || functionalLocation,
        cmmsInternalId: asset['CMMS Internal ID'] || functionalLocation,
        functionalLocation: functionalLocation,
        functionalLocationDesc: asset['Description'] || functionalLocation,
        functionalLocationLongDesc: asset['Long Description'] || asset['Description'] || functionalLocation,
        maintenancePlant: asset['Maintenance Plant'] || 'Default Plant',
        cmmsSystem: asset['CMMS System'] || 'Default System',
        siteReferenceName: asset['Site Reference Name'] || 'Default Site',
        objectType: asset['Object Type'] || 'Equipment',
        systemStatus: asset['System Status'] || 'Active',
        make: asset['Make'] || null,
        manufacturer: asset['Manufacturer'] || null,
        serialNumber: asset['Serial Number'] || null,
        parent: asset['Parent'] || null
      });
    }

    // Step 1: Nullify all parent relationships first
    await AssetHierarchy.update(
      { parent: null },
      { 
        where: {},
        transaction: t 
      }
    );

    // Step 2: Delete assets that are not in the new set and not referenced
    // We need to do this in a way that respects the hierarchy
    const assetsToDelete = [];
    for (const [id, asset] of existingAssetMap) {
      if (!newAssetMap.has(id) && !referencedAssetIds.has(id)) {
        assetsToDelete.push(id);
      }
    }

    if (assetsToDelete.length > 0) {
      await AssetHierarchy.destroy({
        where: {
          id: assetsToDelete
        },
        transaction: t
      });
    }

    // Step 3: Update or create assets
    const assetMap = new Map();
    const createdAssets = [];

    for (const [id, assetData] of newAssetMap) {
      let asset;
      
      if (existingAssetMap.has(id)) {
        // Update existing asset
        asset = existingAssetMap.get(id);
        await asset.update({
          name: assetData.name,
          cmmsInternalId: assetData.cmmsInternalId,
          functionalLocation: assetData.functionalLocation,
          functionalLocationDesc: assetData.functionalLocationDesc,
          functionalLocationLongDesc: assetData.functionalLocationLongDesc,
          maintenancePlant: assetData.maintenancePlant,
          cmmsSystem: assetData.cmmsSystem,
          siteReferenceName: assetData.siteReferenceName,
          objectType: assetData.objectType,
          systemStatus: assetData.systemStatus,
          make: assetData.make,
          manufacturer: assetData.manufacturer,
          serialNumber: assetData.serialNumber,
          level: 0 // Will be recalculated later
        }, { transaction: t });
      } else {
        // Create new asset
        asset = await AssetHierarchy.create({
          id: assetData.id,
          name: assetData.name,
          cmmsInternalId: assetData.cmmsInternalId,
          functionalLocation: assetData.functionalLocation,
          functionalLocationDesc: assetData.functionalLocationDesc,
          functionalLocationLongDesc: assetData.functionalLocationLongDesc,
          maintenancePlant: assetData.maintenancePlant,
          cmmsSystem: assetData.cmmsSystem,
          siteReferenceName: assetData.siteReferenceName,
          objectType: assetData.objectType,
          systemStatus: assetData.systemStatus,
          make: assetData.make,
          manufacturer: assetData.manufacturer,
          serialNumber: assetData.serialNumber,
          level: 0,
          parent: null // Will be set in the next step
        }, { transaction: t });
      }

      assetMap.set(id, asset);
      createdAssets.push(asset);
    }

    // Step 4: Update parent relationships
    // We do this after all assets are created/updated to ensure all parents exist
    for (const [id, assetData] of newAssetMap) {
      const asset = assetMap.get(id);
      const parentId = assetData.parent;
      
      if (parentId && assetMap.has(parentId)) {
        await asset.update({
          parent: parentId
        }, { transaction: t });
      }
    }

    // Step 5: Calculate levels based on parent relationships
    const calculateLevels = async (asset, level) => {
      await asset.update({ level }, { transaction: t });
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

    // Update file upload status to completed
    await fileUpload.update({
      status: 'completed'
    }, { transaction: t });

    await t.commit();
    res.json({ 
      success: true, 
      message: 'CSV processed successfully',
      data: finalAssets,
      fileUpload: fileUpload
    });
  } catch (error) {
    // Update file upload status to error and ensure it's saved
    try {
      await fileUpload.update({
        status: 'error'
      });
      await t.rollback();
    } catch (updateError) {
      console.error('Error updating file status:', updateError);
      await t.rollback();
    }
    
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

    console.log("assets", assets);
    
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

// Get upload history
exports.getUploadHistory = async (req, res) => {
  try {
    const uploads = await db.file_uploads.findAll({
      where: {
        company: req.user.company
      },
      include: [{
        model: db.users,
        as: 'uploader',
        attributes: ['name', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: 10 // Limit to last 10 uploads
    });

    res.status(200).json({
      status: true,
      data: uploads.map(upload => ({
        id: upload.id,
        fileName: upload.originalName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        status: upload.status,
        uploadedBy: upload.uploader?.name || 'Unknown',
        uploadedAt: upload.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching upload history:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while retrieving upload history."
    });
  }
}; 