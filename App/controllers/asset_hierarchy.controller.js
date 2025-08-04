const db = require("../models");
const { Op } = require('sequelize');
const csv = require('csv-parse/sync');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { sanitizeInput } = require('../helper/validationHelper');

const AssetHierarchy = db.asset_hierarchy;
const TaskHazards = db.task_hazards;
const FileUpload = db.file_uploads;
const User = db.user;

/**
 * Create and Save new Asset Hierarchy entries
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.create = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    // Validate request
    if (!req.body.assets || !Array.isArray(req.body.assets)) {
      const response = errorResponse("Assets array is required", 400);
      return sendResponse(res, response);
    }

    // Validate each asset
    const validationErrors = [];
    req.body.assets.forEach((asset, index) => {
      if (!asset.name || !asset.name.trim()) {
        validationErrors.push(`Asset at index ${index} is missing required field: name`);
      }
      if (!asset.cmmsInternalId || !asset.cmmsInternalId.trim()) {
        validationErrors.push(`Asset at index ${index} is missing required field: cmmsInternalId`);
      }
    });

    if (validationErrors.length > 0) {
      const response = errorResponse("Validation failed", 400, validationErrors);
      return sendResponse(res, response);
    }

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Create all assets without parent relationships first
      const assets = await Promise.all(
        req.body.assets.map(async (asset) => {
          console.log("asset", asset);
          // Generate a unique ID based on timestamp and cmmsInternalId
          const timestamp = Date.now();
          const uniqueId = `${sanitizeInput(asset.cmmsInternalId)}-${timestamp}`;

          return AssetHierarchy.create({
            id: uniqueId,
            companyId: userCompanyId,
            name: sanitizeInput(asset.name),
            description: asset.description ? sanitizeInput(asset.description) : null,
            level: parseInt(asset.level) || 0,
            maintenancePlant: asset.maintenancePlant ? sanitizeInput(asset.maintenancePlant) : null,
            cmmsInternalId: sanitizeInput(asset.cmmsInternalId),
            parent: asset.parent ? sanitizeInput(asset.parent) : null,
            cmmsSystem: asset.cmmsSystem ? sanitizeInput(asset.cmmsSystem) : null,
            siteReferenceName: asset.siteReferenceName ? sanitizeInput(asset.siteReferenceName) : null,
            functionalLocation: asset.functionalLocation ? sanitizeInput(asset.functionalLocation) : null,
            functionalLocationDesc: asset.functionalLocationDesc ? sanitizeInput(asset.functionalLocationDesc) : null,
            functionalLocationLongDesc: asset.functionalLocationLongDesc ? sanitizeInput(asset.functionalLocationLongDesc) : null,
            objectType: asset.objectType ? sanitizeInput(asset.objectType) : null,
            systemStatus: asset.systemStatus ? sanitizeInput(asset.systemStatus) : 'Active',
            make: asset.make ? sanitizeInput(asset.make) : null,
            manufacturer: asset.manufacturer ? sanitizeInput(asset.manufacturer) : null,
            serialNumber: asset.serialNumber ? sanitizeInput(asset.serialNumber) : null
          }, { transaction: t });
        })
      );

      // Calculate hierarchy levels
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

    const response = successResponse("Asset Hierarchy created successfully", result, 201);
    sendResponse(res, response);

  } catch (error) {
    console.error('Error creating asset:', error);
    const response = errorResponse(
      error.message || "Some error occurred while creating the Asset Hierarchy.",
      500
    );
    sendResponse(res, response);
  }
};

/**
 * Handle CSV file upload for bulk asset import
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
/**
 * Generate user-friendly error messages for CSV processing failures
 * @param {Array} validationErrors - Array of validation error messages
 * @param {number} totalRows - Total number of rows in CSV
 * @param {string} idStrategy - The ID strategy determined for this CSV
 */
const generateValidationErrorReport = (validationErrors, totalRows, idStrategy) => {
  const errorCount = validationErrors.length;
  const maxErrorsToShow = 10; // Limit displayed errors to keep message concise
  
  let report = `Found ${errorCount} validation error(s) in ${totalRows} rows:\n\n`;
  
  // Show first few errors with line numbers
  const errorsToShow = validationErrors.slice(0, maxErrorsToShow);
  errorsToShow.forEach((error, index) => {
    report += `• ${error}\n`;
  });
  
  if (validationErrors.length > maxErrorsToShow) {
    report += `\n... and ${validationErrors.length - maxErrorsToShow} more errors.\n`;
  }
  
  report += `\nUsing ID strategy: ${idStrategy || 'auto-detected'}`;
  return report;
};

/**
 * Generate user-friendly error messages for system/processing errors
 * @param {Error} error - The error that occurred
 */
const generateSystemErrorReport = (error) => {
  const errorType = error.name || 'UnknownError';
  const errorMessage = error.message || 'An unexpected error occurred';
  
  // Handle specific error types with actionable messages
  if (errorType === 'SequelizeUniqueConstraintError') {
    // Extract field information from constraint error
    if (errorMessage.includes('PRIMARY')) {
      return 'Duplicate asset IDs found in CSV. Each asset must have a unique ID.';
    } else if (errorMessage.includes('cmms_internal_id')) {
      return 'Duplicate CMMS Internal IDs found in CSV. Each asset must have a unique CMMS Internal ID.';
    } else if (errorMessage.includes('functional_location')) {
      return 'Duplicate Functional Locations found in CSV. Each asset must have a unique Functional Location.';
    }
    return 'Duplicate values found in CSV. Check that all required fields have unique values.';
  }
  
  if (errorType === 'SequelizeForeignKeyConstraintError') {
    return 'Invalid parent reference found. Ensure all parent IDs exist in the CSV or database.';
  }
  
  if (errorMessage.includes('CSV file is empty')) {
    return 'CSV file is empty or contains no data rows.';
  }
  
  if (errorMessage.includes('parse') || errorMessage.includes('CSV')) {
    return 'CSV format error. Check file format, encoding (use UTF-8), and ensure proper column headers.';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return 'Processing timeout. Try uploading a smaller file or split large files into multiple uploads.';
  }
  
  if (errorMessage.includes('memory') || errorMessage.includes('ENOMEM')) {
    return 'File too large to process. Split the file into smaller parts (recommended: under 1000 rows per file).';
  }
  
  if (errorMessage.includes('permission') || errorMessage.includes('access')) {
    return 'Permission denied. Contact your administrator to verify your upload permissions.';
  }
  
  // For unknown errors, provide the basic error message but make it more user-friendly
  return `Processing error: ${errorMessage.split('\n')[0]}. Contact support if this persists.`;
};

/**
 * Process CSV file asynchronously
 * @param {object} fileUpload - File upload record
 * @param {Buffer} fileBuffer - CSV file buffer
 * @param {number} userCompanyId - User's company ID
 */
const processCSVAsync = async (fileUpload, fileBuffer, userCompanyId) => {
  try {
    // Update status to processing
    await fileUpload.update({ status: 'processing' });

    const result = await db.sequelize.transaction(async (t) => {
      // Parse CSV from buffer directly
      const csvString = fileBuffer.toString('utf-8');
      const assets = csv.parse(csvString, {
        columns: true,
        skip_empty_lines: true
      });

      // Find all assets that are referenced by task hazards
      const referencedAssets = await TaskHazards.unscoped().findAll({
        where: {
          companyId: userCompanyId
        },
        attributes: ['assetHierarchyId'],
        group: 'assetHierarchyId',
        transaction: t
      });

      const referencedAssetIds = new Set(referencedAssets.map(a => a.assetHierarchyId));

      // Get all existing assets (including soft-deleted ones)
      const existingAssets = await AssetHierarchy.unscoped().findAll({
        where: {
          companyId: userCompanyId
        },
        paranoid: false,
        transaction: t
      });

      const existingAssetMap = new Map(existingAssets.map(asset => [asset.id, asset]));
      const deletedAssetIds = new Set(existingAssets.filter(asset => asset.deletedAt !== null).map(asset => asset.id));

      // Create a map for the new assets from CSV and validate required columns
      const newAssetMap = new Map();
      const validationErrors = [];

      if (assets.length === 0) {
        throw new Error("CSV file is empty or contains no valid data rows.");
      }

      // Step 1: Determine ID strategy and validate consistency
      const idsSet = new Set();
      const cmmsInternalIdsSet = new Set();
      const functionalLocationsSet = new Set();
      let hasIds = false;
      let idStrategy = null; // 'id', 'cmms_internal_id', or 'functional_location'

      // First pass: collect all potential ID fields
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const rowNumber = i + 1;

        if (asset['id'] && asset['id'].trim() !== '') {
          hasIds = true;
          idsSet.add(asset['id'].trim());
        }
        if (asset['cmms_internal_id'] && asset['cmms_internal_id'].trim() !== '') {
          cmmsInternalIdsSet.add(asset['cmms_internal_id'].trim());
        }
        if (asset['functional_location'] && asset['functional_location'].trim() !== '') {
          functionalLocationsSet.add(asset['functional_location'].trim());
        }
      }

      // Determine and validate ID strategy
      if (hasIds) {
        // Check if ALL rows have IDs and they are unique
        if (idsSet.size !== assets.length) {
          validationErrors.push(`ID column has non-unique values: found ${idsSet.size} unique IDs for ${assets.length} rows`);
        }
        idStrategy = 'id';
      } else {
        // No IDs provided, determine alternative strategy
        const canUseCmmsId = cmmsInternalIdsSet.size === assets.length;
        const canUseFunctionalLocation = functionalLocationsSet.size === assets.length;

        if (canUseCmmsId && canUseFunctionalLocation) {
          // Both are unique and complete, prefer cmms_internal_id
          idStrategy = 'cmms_internal_id';
        } else if (canUseCmmsId) {
          idStrategy = 'cmms_internal_id';
        } else if (canUseFunctionalLocation) {
          idStrategy = 'functional_location';
        } else {
          validationErrors.push(`No valid unique ID column found: cmms_internal_id has ${cmmsInternalIdsSet.size} unique values, functional_location has ${functionalLocationsSet.size} unique values (need ${assets.length})`);
        }
      }

      // Step 2: Validate each row and build asset map
      const nameToIdMap = new Map(); // Track name -> last seen ID mapping
      const rawParentRelationships = new Map(); // Track raw parent-child relationships before resolution

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const rowNumber = i + 1;

        // Validate required name field
        if (!asset['name'] || asset['name'].trim() === '') {
          validationErrors.push(`Missing name on row ${rowNumber}`);
          continue;
        }

        // Determine the ID for this asset based on strategy
        let assetId;
        switch (idStrategy) {
          case 'id':
            assetId = asset['id'].trim();
            break;
          case 'cmms_internal_id':
            if (!asset['cmms_internal_id'] || asset['cmms_internal_id'].trim() === '') {
              validationErrors.push(`Missing cmms_internal_id on row ${rowNumber}`);
              continue;
            }
            assetId = asset['cmms_internal_id'].trim();
            break;
          case 'functional_location':
            if (!asset['functional_location'] || asset['functional_location'].trim() === '') {
              validationErrors.push(`Missing functional_location on row ${rowNumber}`);
              continue;
            }
            assetId = asset['functional_location'].trim();
            break;
          default:
            validationErrors.push(`Unable to determine ID strategy on row ${rowNumber}`);
            continue;
        }

        // Fill in missing fields with intelligent defaults
        const name = asset['name'].trim();
        const cmmsInternalId = asset['cmms_internal_id']?.trim() || assetId;
        const functionalLocation = asset['functional_location']?.trim() || assetId;
        const functionalLocationDesc = asset['functional_location_desc']?.trim() || name;

        // Update name-to-ID mapping (last occurrence wins)
        nameToIdMap.set(name, assetId);

        // Store raw parent relationship if specified
        const rawParentId = asset['parent_id']?.trim() || null;
        if (rawParentId) {
          rawParentRelationships.set(assetId, rawParentId);
        }

        // Build asset data
        const assetData = {
          id: assetId,
          companyId: userCompanyId,
          name: name,
          description: asset['description']?.trim() || null,
          cmmsInternalId: cmmsInternalId,
          functionalLocation: functionalLocation,
          functionalLocationDesc: functionalLocationDesc,
          functionalLocationLongDesc: asset['functional_location_long_desc']?.trim() || functionalLocationDesc,
          maintenancePlant: asset['maintenance_plant']?.trim() || 'Default Plant',
          cmmsSystem: asset['cmms_system']?.trim() || 'Default System',
          objectType: asset['object_type']?.trim() || 'Equipment',
          systemStatus: asset['system_status']?.trim() || 'Active',
          make: asset['make']?.trim() || null,
          manufacturer: asset['manufacturer']?.trim() || null,
          serialNumber: asset['serial_number']?.trim() || null,
          parent: null, // Will be resolved in next step
          level: 0
        };

        newAssetMap.set(assetId, assetData);
      }

      // Step 3: Resolve parent relationships (ID or name lookup)
      const resolvedParentRelationships = new Map();

      for (const [childId, rawParentId] of rawParentRelationships) {
        let resolvedParentId = null;

        // First check if rawParentId is a direct ID match
        if (newAssetMap.has(rawParentId)) {
          resolvedParentId = rawParentId;
        } else if (nameToIdMap.has(rawParentId)) {
          // If not a direct ID, check if it's a name that maps to an ID
          resolvedParentId = nameToIdMap.get(rawParentId);
        }

        if (resolvedParentId) {
          resolvedParentRelationships.set(childId, resolvedParentId);
          // Update the asset data with resolved parent
          const assetData = newAssetMap.get(childId);
          assetData.parent = resolvedParentId;
        } else {
          const childAsset = newAssetMap.get(childId);
          validationErrors.push(`Parent '${rawParentId}' not found for asset '${childAsset.name}' (${childId})`);
        }
      }

      // Step 4: Validate for cyclic parent relationships
      const detectCycle = (assetId, visited = new Set(), path = new Set()) => {
        if (path.has(assetId)) {
          return true; // Cycle detected
        }
        if (visited.has(assetId)) {
          return false; // Already processed this branch
        }

        visited.add(assetId);
        path.add(assetId);

        const parentId = resolvedParentRelationships.get(assetId);
        if (parentId && detectCycle(parentId, visited, path)) {
          return true;
        }

        path.delete(assetId);
        return false;
      };

      const visitedGlobal = new Set();
      for (const assetId of newAssetMap.keys()) {
        if (!visitedGlobal.has(assetId) && detectCycle(assetId, visitedGlobal)) {
          const assetData = newAssetMap.get(assetId);
          validationErrors.push(`Cyclic dependency detected with asset '${assetData.name}' (${assetId})`);
        }
      }

      // If we found validation errors, throw an error with all issues
      if (validationErrors.length > 0) {
        const errorReport = generateValidationErrorReport(validationErrors, assets.length, idStrategy);
        const validationError = new Error(errorReport);
        validationError.name = 'ValidationError';
        throw validationError;
      }

      // Step 5: Nullify all parent relationships first
      await AssetHierarchy.update(
        { parent: null },
        {
          where: { companyId: userCompanyId },
          transaction: t
        }
      );

      // Step 6: Delete assets that are not in the new set and not referenced
      // We need to do this in a way that respects the hierarchy
      // Only consider non-deleted assets for deletion (don't delete already soft-deleted assets)
      const assetsToDelete = [];
      for (const [id, asset] of existingAssetMap) {
        if (!newAssetMap.has(id) && !referencedAssetIds.has(id) && !deletedAssetIds.has(id)) {
          assetsToDelete.push(id);
        }
      }

      if (assetsToDelete.length > 0) {
        await AssetHierarchy.destroy({
          where: {
            id: { [Op.in]: assetsToDelete }
          },
          transaction: t
        });
      }

      // Step 7: Update or create assets (handle soft-deleted assets properly)
      const assetMap = new Map();
      const createdAssets = [];

      for (const [id, assetData] of newAssetMap) {
        let asset;

        if (existingAssetMap.has(id)) {
          // Update existing asset (including restoring soft-deleted ones)
          asset = existingAssetMap.get(id);
          const updateData = {
            name: assetData.name,
            description: assetData.description,
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
            level: 0, // Will be recalculated later
            parent: null // Reset parent, will be set later
          };

          // If asset was soft-deleted, restore it
          if (deletedAssetIds.has(id)) {
            updateData.deletedAt = null;
          }

          // Use unscoped update to handle soft-deleted records
          await AssetHierarchy.unscoped().update(updateData, {
            where: { id: id },
            transaction: t
          });
          
          // Reload the asset to get updated data
          asset = await AssetHierarchy.unscoped().findByPk(id, { transaction: t });
        } else {
          // Create new asset
          asset = await AssetHierarchy.create({
            id: assetData.id,
            companyId: assetData.companyId,
            name: assetData.name,
            description: assetData.description,
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

      // Step 8: Update parent relationships
      // We do this after all assets are created/updated to ensure all parents exist
      for (const [id, assetData] of newAssetMap) {
        const parentId = assetData.parent;
        if (parentId && assetMap.has(parentId)) {
          await AssetHierarchy.unscoped().update(
            { parent: parentId },
            { 
              where: { id: id },
              transaction: t 
            }
          );
        }
      }

      // Step 9: Calculate levels based on parent relationships
      const calculateLevels = async (asset, level) => {
        await AssetHierarchy.unscoped().update(
          { level: level }, 
          { 
            where: { id: asset.id },
            transaction: t 
          }
        );
        const children = await AssetHierarchy.unscoped().findAll({
          where: { 
            parent: asset.id,
            companyId: userCompanyId,
            deletedAt: null // Only process non-deleted children
          },
          attributes: ['id', 'parent'],
          transaction: t
        });
        for (const child of children) {
          await calculateLevels(child, level + 1);
        }
      };

      // Start with root assets (those without parents) - only active assets
      const rootAssets = await AssetHierarchy.findAll({
        where: { 
          parent: null, 
          companyId: userCompanyId 
        },
        transaction: t
      });

      for (const rootAsset of rootAssets) {
        await calculateLevels(rootAsset, 0);
      }

      // Fetch the final state of all assets with proper ordering (excluding soft-deleted)
      const finalAssets = await AssetHierarchy.findAll({
        order: [['level', 'ASC'], ['name', 'ASC']],
        where: {
          companyId: userCompanyId
        },
        transaction: t
      });

      return { finalAssets, assetCount: newAssetMap.size };
    });

    // Update file upload status to completed
    await fileUpload.update({
      status: 'completed',
      errorMessage: null
    });

    console.log(`CSV processing completed successfully for file ${fileUpload.id}. Processed ${result.assetCount} assets.`);
    
  } catch (error) {
    console.error('Error processing CSV:', error);
    
    // Generate user-friendly error message
    let userFriendlyErrorMessage;
    
    if (error.name === 'ValidationError') {
      // This is already a formatted validation error
      userFriendlyErrorMessage = error.message;
    } else {
      // This is a system/processing error - make it user-friendly
      userFriendlyErrorMessage = generateSystemErrorReport(error);
    }
    
    // Update file upload status to error
    await fileUpload.update({
      status: 'error',
      errorMessage: userFriendlyErrorMessage
    });
  }
};

exports.uploadCSV = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    if (!req.file) {
      const response = errorResponse('No file uploaded', 400);
      return sendResponse(res, response);
    }

    // Create file upload record immediately
    const fileUpload = await FileUpload.create({
      fileName: req.file.filename || `${Date.now()}-${sanitizeInput(req.file.originalname)}`,
      originalName: sanitizeInput(req.file.originalname),
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploaderId: req.user.id,
      companyId: userCompanyId,
      status: 'uploading'
    });

    // Send immediate response
    const response = successResponse('CSV upload started successfully', {
      uploadId: fileUpload.id,
      fileName: fileUpload.originalName,
      status: 'processing',
      message: 'Your CSV file is being processed in the background. You will be notified when processing is complete.'
    });
    sendResponse(res, response);

    // Process CSV asynchronously (don't await)
    setImmediate(() => {
      processCSVAsync(fileUpload, req.file.buffer, userCompanyId);
    });

  } catch (error) {
    console.error('Error in uploadCSV:', error);
    const response = errorResponse(
      'Error initiating CSV upload',
      400,
      error.message
    );
    sendResponse(res, response);
  }
};

/**
 * Retrieve all Asset Hierarchy entries
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findAll = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    const assets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']],
      where: {
        companyId: userCompanyId
      }
    });

    const response = successResponse("Asset hierarchy retrieved successfully", assets);
    sendResponse(res, response);
  } catch (error) {
    console.error('Error retrieving asset hierarchy:', error);
    const response = errorResponse(
      error.message || "Some error occurred while retrieving asset hierarchy.",
      500
    );
    sendResponse(res, response);
  }
};

/**
 * Find a single Asset Hierarchy entry with an id
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findOne = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    const asset = await AssetHierarchy.findOne({
      where: {
        id: req.params.id,
        companyId: userCompanyId // Ensure user can only access their company's assets
      },
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
      const response = errorResponse("Asset not found", 404);
      return sendResponse(res, response);
    }

    const response = successResponse("Asset retrieved successfully", asset);
    sendResponse(res, response);
  } catch (error) {
    console.error('Error retrieving asset:', error);
    const response = errorResponse(
      error.message || `Error retrieving Asset with id ${req.params.id}`,
      500
    );
    sendResponse(res, response);
  }
};



/**
 * Get upload history for the current company
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getUploadHistory = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    const uploads = await FileUpload.findAll({
      where: {
        companyId: userCompanyId
      },
      include: [{
        model: User,
        as: 'uploadedBy',
        attributes: ['id', 'name', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: 10 // Limit to last 10 uploads
    });

    // Format the response data
    const formattedUploads = uploads.map(upload => {
      // Extract error summary for display
      let errorSummary = null;
      if (upload.errorMessage) {
        // Extract first line as summary, which should be user-friendly now
        const firstLine = upload.errorMessage.split('\n')[0];
        if (firstLine.includes('Found') && firstLine.includes('validation error')) {
          // Extract error count for validation errors
          const errorCount = (firstLine.match(/Found (\d+) validation error/)?.[1] || 'unknown');
          errorSummary = `${errorCount} validation error(s)`;
        } else {
          // For system errors, use the first line (should be concise now)
          errorSummary = firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;
        }
      }

      return {
        id: upload.id,
        fileName: upload.originalName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        status: upload.status,
        errorMessage: upload.errorMessage, // Full error message
        errorSummary: errorSummary, // Short summary for display
        uploadedBy: upload.uploadedBy?.name || 'Unknown',
        uploadedAt: upload.createdAt,
        updatedAt: upload.updatedAt
      };
    });

    const response = successResponse("Upload history retrieved successfully", formattedUploads);
    sendResponse(res, response);
  } catch (error) {
    console.error('Error fetching upload history:', error);
    const response = errorResponse(
      error.message || "Some error occurred while retrieving upload history.",
      500
    );
    sendResponse(res, response);
  }
};

/**
 * Get the status of a specific upload
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getUploadStatus = async (req, res) => {
  try {
    // Get user's company ID
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      const response = errorResponse("User's company information is missing", 400);
      return sendResponse(res, response);
    }

    const uploadId = req.params.uploadId;
    if (!uploadId) {
      const response = errorResponse("Upload ID is required", 400);
      return sendResponse(res, response);
    }

    const upload = await FileUpload.findOne({
      where: {
        id: uploadId,
        companyId: userCompanyId
      },
      include: [{
        model: User,
        as: 'uploadedBy',
        attributes: ['id', 'name', 'email']
      }]
    });

    if (!upload) {
      const response = errorResponse("Upload not found", 404);
      return sendResponse(res, response);
    }

    // Extract error summary for display
    let errorSummary = null;
    if (upload.errorMessage) {
      // Extract first line as summary, which should be user-friendly now
      const firstLine = upload.errorMessage.split('\n')[0];
      if (firstLine.includes('Found') && firstLine.includes('validation error')) {
        // Extract error count for validation errors
        const errorCount = (firstLine.match(/Found (\d+) validation error/)?.[1] || 'unknown');
        errorSummary = `${errorCount} validation error(s)`;
      } else {
        // For system errors, use the first line (should be concise now)
        errorSummary = firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;
      }
    }

    // Format the response data
    const uploadStatus = {
      id: upload.id,
      fileName: upload.originalName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      status: upload.status,
      errorMessage: upload.errorMessage, // Full detailed error message
      errorSummary: errorSummary, // Short summary for display
      uploadedBy: upload.uploadedBy?.name || 'Unknown',
      uploadedAt: upload.createdAt,
      updatedAt: upload.updatedAt
    };

    const response = successResponse("Upload status retrieved successfully", uploadStatus);
    sendResponse(res, response);
  } catch (error) {
    console.error('Error fetching upload status:', error);
    const response = errorResponse(
      error.message || "Some error occurred while retrieving upload status.",
      500
    );
    sendResponse(res, response);
  }
}; 

// exports.delete = async (req, res) => {
//   try {
//     // Validate user company access
//     const userCompanyId = req.user.company_id || req.user.company?.id;
//     if (!userCompanyId) {
//       const response = errorResponse("User's company information is missing", 400);
//       return sendResponse(res, response);
//     }

//     const id = req.params.id;

//     // Start transaction
//     const result = await db.sequelize.transaction(async (t) => {
//       // Find asset with company validation and include children
//       const asset = await AssetHierarchy.findOne({
//         where: {
//           id: id,
//           companyId: userCompanyId
//         },
//         include: [{
//           model: AssetHierarchy,
//           as: 'children'
//         }],
//         transaction: t
//       });

//       if (!asset) {
//         throw new Error("Asset not found.");
//       }

//       // Check if asset is referenced by task hazards
//       const referencedByTaskHazards = await TaskHazards.findOne({
//         where: {
//           assetHierarchyId: id,
//           companyId: userCompanyId
//         },
//         transaction: t
//       });

//       if (referencedByTaskHazards) {
//         throw new Error("Cannot delete asset that is referenced by task hazards.");
//       }

//       // Check if asset is referenced by risk assessments
//       const referencedByRiskAssessments = await RiskAssessments.findOne({
//         where: {
//           assetHierarchyId: id,
//           companyId: userCompanyId
//         },
//         transaction: t
//       });

//       if (referencedByRiskAssessments) {
//         throw new Error("Cannot delete asset that is referenced by risk assessments.");
//       }

//       // Delete asset and all its children recursively
//       await deleteAssetRecursively(asset, t);

//       return { message: "Asset deleted successfully" };
//     });

//     const response = successResponse(result.message, result);
//     sendResponse(res, response);

//   } catch (error) {
//     console.error('Error deleting asset:', error);
    
//     if (error.message === "Asset not found") {
//       const response = errorResponse(error.message, 404);
//       return sendResponse(res, response);
//     }
    
//     if (error.message.includes("Cannot delete asset that is referenced")) {
//       const response = errorResponse(error.message, 400);
//       return sendResponse(res, response);
//     }
    
//     const response = errorResponse(
//       error.message || "Some error occurred while deleting the Asset.",
//       500
//     );
//     sendResponse(res, response);
//   }
// };

// const deleteAssetRecursively = async (asset, transaction) => {
//   // First, get all children of this asset
//   const children = await AssetHierarchy.findAll({
//     where: { parent: asset.id },
//     transaction: transaction
//   });

//   // Recursively delete all children first
//   for (const child of children) {
//     await deleteAssetRecursively(child, transaction);
//   }

//   // Finally, delete the current asset
//   await asset.destroy({ transaction: transaction });
// };