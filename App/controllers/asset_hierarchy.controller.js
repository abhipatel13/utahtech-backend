const db = require("../models");
const { Op } = require('sequelize');
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
      console.log("asset", asset);
      
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
            companyId: req.body.company.id,
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
  try {
    await db.sequelize.transaction(async (t) => {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      // Create file upload record
      const fileUpload = await db.file_uploads.create({
        fileName: req.file.filename || `${Date.now()}-${req.file.originalname}`,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploaderId: req.user.id,
        companyId: req.user.company.id,
        status: 'uploading'  // Explicitly set initial status
      }, { 
        transaction: t
      });

      // Parse CSV from buffer directly
      const csvString = req.file.buffer.toString('utf-8');
      const assets = csv.parse(csvString, {
        columns: true,
        skip_empty_lines: true
      });

      // Find all assets that are referenced by task hazards
      const referencedAssets = await TaskHazards.unscoped().findAll({
        where: {
          companyId: req.user.company.id
        },
        attributes: ['assetHierarchyId'], // asset
        group: 'assetHierarchyId',
        transaction: t
      });

      const referencedAssetIds = new Set(referencedAssets.map(a => a.assetHierarchyId));

      // Get all existing assets
      const existingAssets = await AssetHierarchy.findAll({
        where: {
          companyId: req.user.company.id
        },
        transaction: t
      });

      const existingAssetMap = new Map(existingAssets.map(asset => [asset.id, asset]));

      // Create a map for the new assets from CSV and validate required columns
      const newAssetMap = new Map();
      const validationErrors = [];
      
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const assetIndex = i + 1; // 1-based index for user-friendly error messages
        
        // Check all required columns from the asset_hierarchy model
        const name = asset['name'];
        const functionalLocation = asset['functional_location'];
        const functionalLocationDesc = asset['functional_location_desc'];
        const cmmsInternalId = asset['cmms_internal_id'];
        
        // Validate required fields
        if (!functionalLocation || functionalLocation.trim() === '') {
          validationErrors.push(`Row ${assetIndex}: 'functional_location' is required and cannot be empty`);
        }
        
        if (!name || name.trim() === '') {
          validationErrors.push(`Row ${assetIndex}: 'name' is required and cannot be empty`);
        }
        
        if (!functionalLocationDesc || functionalLocationDesc.trim() === '') {
          validationErrors.push(`Row ${assetIndex}: 'functional_location_desc' is required and cannot be empty`);
        }
        
        if (!cmmsInternalId || cmmsInternalId.trim() === '') {
          validationErrors.push(`Row ${assetIndex}: 'cmms_internal_id' is required and cannot be empty`);
        }
        
        // If we have validation errors, skip adding this asset to the map
        if (!functionalLocation || functionalLocation.trim() === '' || 
            !name || name.trim() === '' || 
            !functionalLocationDesc || functionalLocationDesc.trim() === '' ||
            !cmmsInternalId || cmmsInternalId.trim() === '') {
          continue;
        }
        const id = asset['id'] || `${asset.cmmsInternalId}-${Date.now()}`;

        newAssetMap.set(id, {
          id: id,
          companyId: req.user.company.id,
          name: name,
          cmmsInternalId: cmmsInternalId,
          functionalLocation: functionalLocation,
          functionalLocationDesc: functionalLocationDesc,
          functionalLocationLongDesc: asset['functional_location_long_desc'] || functionalLocationDesc,
          maintenancePlant: asset['maintenance_plant'] || 'Default Plant',
          cmmsSystem: asset['cmms_system'] || 'Default System',
          objectType: asset['object_type'] || 'Equipment',
          systemStatus: asset['system_status'] || 'Active',
          make: asset['make'] || null,
          manufacturer: asset['manufacturer'] || null,
          serialNumber: asset['serial_number'] || null,
          parent: asset['parent_id'] || null,
          level: 0
        });
      }
      
      // If we found validation errors, throw an error with all issues
      if (validationErrors.length > 0) {
        throw new Error(`CSV validation failed:\n${validationErrors.join('\n')}`);
      }

      // Step 1: Nullify all parent relationships first
      await AssetHierarchy.update(
        { parent: null },
        { 
          where: { companyId: req.user.company.id },
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
            id: {[Op.in]: assetsToDelete}
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
            companyId: assetData.companyId,
            name: assetData.name,
            cmmsInternalId: assetData.cmmsInternalId,
            functionalLocation: assetData.functionalLocation,
            functionalLocationDesc: assetData.functionalLocationDesc,
            functionalLocationLongDesc: assetData.functionalLocationLongDesc,
            maintenancePlant: assetData.maintenancePlant,
            cmmsSystem: assetData.cmmsSystem,
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
        const asset = await AssetHierarchy.findByPk(id, { attributes: ['id', 'parent'], transaction: t });
        const parentId = assetData.parent;
        if (parentId && assetMap.has(parentId)) {
          await asset.setParentId(parentId, { transaction: t });
        }
      }

      // Step 5: Calculate levels based on parent relationships
      const calculateLevels = async (asset, level) => {
        await asset.update({ level:level }, { transaction: t });
        const children = await AssetHierarchy.findAll({
          where: { parent: asset.id },
          attributes: ['id', 'parent'],
          transaction: t
        });
        for (const child of children) {
          await calculateLevels(child, level + 1);
        }
      };

      // Start with root assets (those without parents)
      const rootAssets = await AssetHierarchy.findAll({
        where: { parent: null, companyId: req.user.company.id },
        transaction: t
      });
      
      for (const rootAsset of rootAssets) {
        await calculateLevels(rootAsset, 0);
      }

      // Fetch the final state of all assets with proper ordering
      const finalAssets = await AssetHierarchy.findAll({
        order: [['level', 'ASC'], ['name', 'ASC']],
        where: {
          companyId: req.user.company.id
        },
        transaction: t
      });

      // Update file upload status to completed
      await fileUpload.update({
        status: 'completed'
      }, { transaction: t });

      res.status(200).json({
        status: true,
        message: 'CSV processed successfully',
        data: finalAssets,
        fileUpload: fileUpload
      });
    })
  } catch (error) {
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
      order: [['level', 'ASC'], ['name', 'ASC']],
      where: {
        companyId: req.user.company_id
      }
    });

    // console.log("assets", assets);
    
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
        companyId: req.user.company.id
      },
      include: [{
        model: db.user,
        as: 'uploadedBy',
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