const db = require("../models");
const AssetHierarchy = db.asset_hierarchy;
const TaskHazards = db.task_hazards;
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

    console.log(req.body.assets);

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


          console.log("asset.functionalLocationDesc", asset.functionalLocation, "asset.functionalLocationLongDesc", asset.functionalLocationLongDesc);
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

      // Create a map of all assets using ID for quick lookup
      const assetMap = new Map(assets.map(asset => [asset.id, asset]));

      // Finally, calculate and update levels
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
      return res.status(400).json({
        status: false,
        message: 'No file uploaded'
      });
    }

    console.log('File received:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const csvString = req.file.buffer.toString('utf-8');
    console.log('CSV string length:', csvString.length);
    
    const lines = csvString.split('\n');
    console.log('Number of lines:', lines.length);
    
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('CSV headers:', headers);

    // Validate headers
    const requiredHeaders = [
      'Maintenance Plant',
      'Primary Key',
      'CMMS Internal ID',
      'Functional Location',
      'Parent',
      'CMMS System',
      'Site Reference Name',
      'Functional Location Description',
      'Functional Location Long Description',
      'Object Type (Taxonomy Mapping Value)',
      'System Status',
      'Make',
      'Manufacturer',
      'Serial Number'
    ];

    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    // Process the CSV data first to get all assets
    const assets = [];
    const parentMap = new Map();
    
    // Skip header and field description rows
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim());
      
      // Skip the field description row
      if (values[headers.indexOf('Maintenance Plant')] === 'System generated from last number') {
        continue;
      }
      
      const functionalLocation = values[headers.indexOf('Functional Location')];
      const description = values[headers.indexOf('Functional Location Description')];
      
      if (!functionalLocation || !description) {
        throw new Error(`Row ${i + 1}: Both Functional Location and Description are required`);
      }

      const parent = values[headers.indexOf('Parent')] || null;
      if (parent) {
        parentMap.set(functionalLocation, parent);
      }

      const asset = {
        id: functionalLocation,
        internalId: values[headers.indexOf('CMMS Internal ID')] || '',
        name: description,
        description: values[headers.indexOf('Functional Location Long Description')] || description,
        parent: parent,
        maintenancePlant: values[headers.indexOf('Maintenance Plant')] || '',
        primaryKey: values[headers.indexOf('Primary Key')] || '',
        cmmsSystem: values[headers.indexOf('CMMS System')] || '',
        siteReference: values[headers.indexOf('Site Reference Name')] || '',
        objectType: values[headers.indexOf('Object Type (Taxonomy Mapping Value)')] || '',
        systemStatus: values[headers.indexOf('System Status')] || 'Active',
        make: values[headers.indexOf('Make')] || '',
        manufacturer: values[headers.indexOf('Manufacturer')] || '',
        serialNumber: values[headers.indexOf('Serial Number')] || '',
        level: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      assets.push(asset);
    }

    if (assets.length === 0) {
      throw new Error('No valid assets found in the CSV file');
    }

    // Delete task hazards first
    await TaskHazards.destroy({ 
      where: {}, 
      transaction: t 
    });

    // Delete all existing asset hierarchy records
    await AssetHierarchy.destroy({ 
      where: {}, 
      transaction: t 
    });

    // First pass: Create all assets without worrying about relationships
    const createdAssets = await Promise.all(
      assets.map(asset => 
        AssetHierarchy.create({
          id: asset.id,
          internalId: asset.internalId,
          name: asset.name,
          description: asset.description,
          parent: asset.parent,
          maintenancePlant: asset.maintenancePlant,
          primaryKey: asset.primaryKey,
          cmmsSystem: asset.cmmsSystem,
          siteReference: asset.siteReference,
          objectType: asset.objectType,
          systemStatus: asset.systemStatus,
          make: asset.make,
          manufacturer: asset.manufacturer,
          serialNumber: asset.serialNumber,
          level: 0 // We'll calculate this in the second pass
        }, { transaction: t })
      )
    );

    // Second pass: Calculate and update levels
    for (const asset of createdAssets) {
      let level = 0;
      let currentParent = asset.parent;
      
      while (currentParent) {
        level++;
        const parentAsset = createdAssets.find(a => a.id === currentParent);
        if (!parentAsset) break;
        currentParent = parentAsset.parent;
      }
      
      await asset.update({ level }, { transaction: t });
    }

    await t.commit();

    // Fetch the final state of all assets with proper ordering
    const finalAssets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      status: true,
      message: 'CSV file processed successfully',
      data: finalAssets
    });

  } catch (error) {
    await t.rollback();
    console.error('Error processing CSV:', error);
    res.status(400).json({
      status: false,
      message: error.message || 'Error processing CSV file'
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