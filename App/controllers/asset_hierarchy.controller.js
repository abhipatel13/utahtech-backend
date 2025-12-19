const db = require("../models");
const { Op } = require('sequelize');
const { v7: uuidv7 } = require('uuid');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { sanitizeInput } = require('../helper/validationHelper');

// Import upload helper modules
const { 
  parseFileBuffer, 
  applyColumnMappings, 
  validateColumnMappings,
  extractHeaders
} = require('../helper/fileParser');
const { 
  validateUploadData, 
  generateErrorReport 
} = require('../helper/assetUploadValidator');
const { 
  fetchExistingAssets, 
  processAssetUpload, 
  createUploadNotification,
  updateUploadStatus
} = require('../helper/assetUploadProcessor');

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
      // Fetch existing assets by external ID to check for duplicates
      const externalIds = req.body.assets.map(asset => sanitizeInput(asset.cmmsInternalId));

      const existingAssets = await AssetHierarchy.findAll({
        where: {
          externalId: {
            [Op.in]: externalIds
          },
          companyId: userCompanyId
        },
        paranoid: false,
        transaction: t
      });
      const existingExternalIds = new Set(existingAssets.map(asset => asset.externalId));

      // Build map of external ID to internal ID for parent resolution
      const externalToInternalMap = new Map();
      for (const asset of existingAssets) {
        externalToInternalMap.set(asset.externalId, asset.id);
      }

      // Create all assets
      const assets = await Promise.all(
        req.body.assets.map(async (asset) => {
          const externalId = sanitizeInput(asset.cmmsInternalId);
          
          // Generate new internal UUID
          const internalId = uuidv7();

          // Resolve parent external ID to internal ID if provided
          let parentInternalId = null;
          if (asset.parent) {
            const parentExternalId = sanitizeInput(asset.parent);
            parentInternalId = externalToInternalMap.get(parentExternalId) || null;
          }

          // Store mapping for subsequent assets
          externalToInternalMap.set(externalId, internalId);

          return AssetHierarchy.create({
            id: internalId,
            externalId: externalId,
            companyId: userCompanyId,
            name: sanitizeInput(asset.name),
            description: asset.description ? sanitizeInput(asset.description) : null,
            level: parseInt(asset.level) || 0,
            maintenancePlant: asset.maintenancePlant ? sanitizeInput(asset.maintenancePlant) : null,
            cmmsInternalId: externalId,
            parent: parentInternalId,
            cmmsSystem: asset.cmmsSystem ? sanitizeInput(asset.cmmsSystem) : null,
            functionalLocation: asset.functionalLocation ? sanitizeInput(asset.functionalLocation) : externalId,
            functionalLocationDesc: asset.functionalLocationDesc ? sanitizeInput(asset.functionalLocationDesc) : sanitizeInput(asset.name),
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
 * Generate user-friendly error messages for system/processing errors
 * @param {Error} error - The error that occurred
 */
const generateSystemErrorReport = (error) => {
  const errorType = error.name || 'UnknownError';
  const errorMessage = error.message || 'An unexpected error occurred';
  
  // Handle specific error types with actionable messages
  if (errorType === 'SequelizeUniqueConstraintError') {
    if (errorMessage.includes('PRIMARY')) {
      return 'Duplicate asset IDs found. Each asset must have a unique ID.';
    } else if (errorMessage.includes('external_id')) {
      return 'Duplicate external IDs found. Each asset must have a unique ID within your company.';
    } else if (errorMessage.includes('cmms_internal_id')) {
      return 'Duplicate CMMS Internal IDs found. Each asset must have a unique CMMS Internal ID.';
    } else if (errorMessage.includes('functional_location')) {
      return 'Duplicate Functional Locations found. Each asset must have a unique Functional Location.';
    }
    return 'Duplicate values found. Check that all required fields have unique values.';
  }
  
  if (errorType === 'SequelizeForeignKeyConstraintError') {
    return 'Invalid parent reference found. Ensure all parent IDs exist in the file or database.';
  }
  
  if (errorMessage.includes('empty') || errorMessage.includes('no valid data')) {
    return 'File is empty or contains no data rows.';
  }
  
  if (errorMessage.includes('parse') || errorMessage.includes('CSV') || errorMessage.includes('Excel')) {
    return 'File format error. Check file format, encoding (use UTF-8), and ensure proper column headers.';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return 'Processing timeout. Try uploading a smaller file or split large files into multiple uploads.';
  }
  
  if (errorMessage.includes('memory') || errorMessage.includes('ENOMEM')) {
    return 'File too large to process. Split the file into smaller parts (recommended: under 5000 rows per file).';
  }
  
  if (errorMessage.includes('permission') || errorMessage.includes('access')) {
    return 'Permission denied. Contact your administrator to verify your upload permissions.';
  }
  
  if (errorMessage.includes('Column mappings')) {
    return errorMessage; // Column mapping errors are already user-friendly
  }
  
  // For unknown errors, provide the basic error message
  return `Processing error: ${errorMessage.split('\n')[0]}. Contact support if this persists.`;
};

/**
 * Threshold in seconds for considering an upload "long-running"
 * Notifications are sent for uploads that exceed this duration or fail
 */
const LONG_RUNNING_THRESHOLD_SECONDS = 30;

/**
 * Process asset file asynchronously (CSV or Excel)
 * @param {object} fileUpload - File upload record
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - Original file name
 * @param {Object} columnMappings - Column mappings from frontend
 * @param {number} userCompanyId - User's company ID
 * @param {number} userId - Uploader's user ID
 */
const processFileAsync = async (fileUpload, fileBuffer, mimeType, fileName, columnMappings, userCompanyId, userId) => {
  const startTime = Date.now();
  
  try {
    // Update status to processing
    await updateUploadStatus(fileUpload, 'processing');

    // Step 1: Parse the file (CSV or Excel)
    const { rows } = parseFileBuffer(fileBuffer, mimeType, fileName);
    console.log(`Parsed ${rows.length} rows from ${fileName}`);

    if (rows.length === 0) {
      throw new Error('File is empty or contains no valid data rows.');
    }

    // Step 2: Get file headers for validation
    const fileHeaders = Object.keys(rows[0]);
    
    // Step 3: Validate column mappings
    const mappingValidation = validateColumnMappings(columnMappings, fileHeaders);
    if (!mappingValidation.valid) {
      const error = new Error(`Column mappings invalid:\n${mappingValidation.errors.join('\n')}`);
      error.name = 'ValidationError';
      throw error;
    }

    // Step 4: Apply column mappings to rows (converts 'id' to 'externalId', 'parent_id' to 'parentExternalId')
    const mappedRows = applyColumnMappings(rows, columnMappings);

    // Step 5: Fetch existing company assets for validation and change detection
    const existingData = await fetchExistingAssets(userCompanyId);

    // Step 6: Validate all upload data
    const validationResult = validateUploadData(
      mappedRows, 
      existingData.existingAssetIds, 
      existingData.existingParentMap
    );
    
    if (!validationResult.valid) {
      const errorReport = generateErrorReport(validationResult.errors, validationResult.summary.totalRows);
      const error = new Error(errorReport);
      error.name = 'ValidationError';
      error.errors = validationResult.errors; // Attach structured errors
      throw error;
    }

    // Step 7: Process the upload (bulk create/update, skipping unchanged)
    const result = await processAssetUpload(
      validationResult.assetData, 
      userCompanyId, 
      existingData
    );

    // Step 8: Update file upload status to completed with result summary
    await updateUploadStatus(fileUpload, 'completed', {
      resultSummary: {
        totalProcessed: result.totalProcessed,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        processingTime: result.processingTime
      }
    });

    const processingTimeSeconds = (Date.now() - startTime) / 1000;
    
    console.log(`File processing completed for ${fileUpload.id}. ` +
      `Processed ${result.totalProcessed} assets: ` +
      `${result.createdCount} created, ${result.updatedCount} updated, ${result.unchangedCount} unchanged. ` +
      `Time: ${result.processingTime}`);

    // Create notification if processing took a long time
    if (processingTimeSeconds > LONG_RUNNING_THRESHOLD_SECONDS) {
      await createUploadNotification(userId, 'success', fileName, {
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount
      });
    }
    
  } catch (error) {
    console.error('Error processing file:', error);
    
    // Generate user-friendly error message
    let userFriendlyErrorMessage;
    let structuredErrors = null;
    
    if (error.name === 'ValidationError') {
      userFriendlyErrorMessage = error.message;
      structuredErrors = error.errors || null;
    } else {
      userFriendlyErrorMessage = generateSystemErrorReport(error);
    }
    
    // Update file upload status to error
    await updateUploadStatus(fileUpload, 'error', { 
      errorMessage: userFriendlyErrorMessage 
    });

    // Always notify on failure
    await createUploadNotification(userId, 'error', fileName, {
      errorSummary: userFriendlyErrorMessage.split('\n')[0]
    });
  }
};

/**
 * Handle file upload for bulk asset import (CSV or Excel)
 * Supports column mapping from frontend
 */
exports.uploadAssets = async (req, res) => {
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

    // Parse column mappings from request body
    let columnMappings;
    try {
      columnMappings = req.body.columnMappings 
        ? JSON.parse(req.body.columnMappings) 
        : null;
    } catch (parseError) {
      const response = errorResponse('Invalid column mappings format. Expected JSON.', 400);
      return sendResponse(res, response);
    }

    if (!columnMappings) {
      const response = errorResponse('Column mappings are required', 400);
      return sendResponse(res, response);
    }

    // Validate required mappings exist
    // Frontend sends 'id' and 'name' - we keep this interface for backward compatibility
    if (!columnMappings.id || !columnMappings.name) {
      const response = errorResponse('Column mappings must include "id" and "name" fields', 400);
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
    const response = successResponse('File upload started successfully', {
      uploadId: fileUpload.id,
      fileName: fileUpload.originalName,
      status: 'processing',
      message: 'Your file is being processed in the background. Check the upload status for progress.'
    });
    sendResponse(res, response);

    // Process file asynchronously (don't await)
    setImmediate(() => {
      processFileAsync(
        fileUpload, 
        req.file.buffer, 
        req.file.mimetype,
        req.file.originalname,
        columnMappings,
        userCompanyId,
        req.user.id
      );
    });

  } catch (error) {
    console.error('Error in uploadAssets:', error);
    const response = errorResponse(
      'Error initiating file upload',
      400,
      error.message
    );
    sendResponse(res, response);
  }
};

/**
 * Legacy CSV upload endpoint - redirects to new uploadAssets
 * Maintains backward compatibility for existing clients
 * @deprecated Use uploadAssets instead
 */
exports.uploadCSV = async (req, res) => {
  // If no column mappings provided, try to use legacy behavior
  // by auto-detecting ID column
  if (!req.body.columnMappings && req.file) {
    try {
      const { rows } = parseFileBuffer(
        req.file.buffer, 
        req.file.mimetype, 
        req.file.originalname
      );
      
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        
        // Try to auto-detect column mappings (legacy behavior)
        const columnMappings = autoDetectColumnMappings(headers, rows);
        req.body.columnMappings = JSON.stringify(columnMappings);
      }
    } catch (error) {
      console.error('Error auto-detecting columns:', error);
      // Let it fail in uploadAssets with proper error handling
    }
  }
  
  return exports.uploadAssets(req, res);
};

/**
 * Auto-detect column mappings for legacy CSV uploads
 * @param {Array<string>} headers - File headers
 * @param {Array<Object>} rows - Parsed rows
 * @returns {Object} Column mappings
 */
const autoDetectColumnMappings = (headers, rows) => {
  const mappings = {};
  const headerLower = headers.map(h => h.toLowerCase());
  
  // Map of system field -> possible header names
  const fieldMappings = {
    id: ['id', 'asset_id', 'assetid', 'external_id', 'externalid'],
    name: ['name', 'asset_name', 'assetname', 'functional_location_desc'],
    parent_id: ['parent_id', 'parentid', 'parent', 'parent_functional_location', 'parent_external_id'],
    description: ['description', 'desc', 'asset_description'],
    cmms_internal_id: ['cmms_internal_id', 'cmmsinternalid', 'cmms_id'],
    functional_location: ['functional_location', 'functionallocation', 'func_loc'],
    functional_location_desc: ['functional_location_desc', 'func_loc_desc'],
    functional_location_long_desc: ['functional_location_long_desc', 'long_desc'],
    maintenance_plant: ['maintenance_plant', 'plant'],
    cmms_system: ['cmms_system', 'system'],
    object_type: ['object_type', 'type', 'asset_type'],
    system_status: ['system_status', 'status'],
    make: ['make'],
    manufacturer: ['manufacturer'],
    serial_number: ['serial_number', 'serialnumber', 'serial']
  };
  
  for (const [systemField, possibleNames] of Object.entries(fieldMappings)) {
    for (const name of possibleNames) {
      const index = headerLower.indexOf(name.toLowerCase());
      if (index !== -1) {
        mappings[systemField] = headers[index];
        break;
      }
    }
  }
  
  // If no ID column found, try to detect unique column
  if (!mappings.id) {
    const candidates = ['cmms_internal_id', 'functional_location'];
    for (const candidate of candidates) {
      if (mappings[candidate]) {
        // Check if values are unique
        const values = rows.map(r => r[mappings[candidate]]).filter(v => v);
        const uniqueValues = new Set(values);
        if (uniqueValues.size === rows.length) {
          mappings.id = mappings[candidate];
          break;
        }
      }
    }
  }
  
  return mappings;
};

/**
 * Retrieve all Asset Hierarchy entries
 * Returns both internal id and externalId for display
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findAll = async (req, res) => {
  try {
    let whereClause = {};
    
    if (req.user?.role !== 'universal_user') {
      const userCompanyId = req.user.company_id || req.user.company?.id;
      if (!userCompanyId) {
        const response = errorResponse("User's company information is missing", 400);
        return sendResponse(res, response);
      }
      whereClause.companyId = userCompanyId;
    }

    const assets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['upload_order', 'ASC'], ['name', 'ASC']],
      where: whereClause
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
 * Find Asset Hierarchy by Company ID
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findByCompany = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    // Only universal users can access this endpoint
    if (req.user?.role !== 'universal_user') {
      const response = errorResponse("Access denied. Universal user role required.", 403);
      return sendResponse(res, response);
    }

    // Validate company_id parameter
    if (!company_id) {
      const response = errorResponse("Company ID is required", 400);
      return sendResponse(res, response);
    }

    // Build where clause based on company selection
    let whereClause = {};
    
    if (company_id !== 'all') {
      // Validate that company_id is a number
      const companyIdNum = parseInt(company_id);
      if (isNaN(companyIdNum)) {
        const response = errorResponse("Invalid company ID format", 400);
        return sendResponse(res, response);
      }
      whereClause.companyId = companyIdNum;
    }
    // If company_id is 'all', no filtering is applied (empty whereClause)

    const assets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']],
      where: whereClause,
      include: [
        {
          model: db.company,
          as: 'company',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    const response = successResponse(
      company_id === 'all' 
        ? "All asset hierarchy retrieved successfully" 
        : `Asset hierarchy for company ${company_id} retrieved successfully`, 
      assets
    );
    sendResponse(res, response);
  } catch (error) {
    console.error('Error retrieving asset hierarchy by company:', error);
    const response = errorResponse(
      error.message || "Some error occurred while retrieving asset hierarchy by company.",
      500
    );
    sendResponse(res, response);
  }
};

/**
 * Find a single Asset Hierarchy entry by internal ID
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findOne = async (req, res) => {
  try {
    // Universal users don't have company restrictions
    let whereClause = { id: req.params.id };
    
    if (req.user?.role !== 'universal_user') {
      // Get user's company ID for non-universal users
      const userCompanyId = req.user.company_id || req.user.company?.id;
      if (!userCompanyId) {
        const response = errorResponse("User's company information is missing", 400);
        return sendResponse(res, response);
      }
      whereClause.companyId = userCompanyId; // Ensure user can only access their company's assets
    }
    // Universal users can access all assets

    const asset = await AssetHierarchy.findOne({
      where: whereClause,
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
 * Find a single Asset Hierarchy entry by external ID
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.findByExternalId = async (req, res) => {
  try {
    const externalId = req.params.externalId;
    
    let whereClause = { externalId };
    
    if (req.user?.role !== 'universal_user') {
      const userCompanyId = req.user.company_id || req.user.company?.id;
      if (!userCompanyId) {
        const response = errorResponse("User's company information is missing", 400);
        return sendResponse(res, response);
      }
      whereClause.companyId = userCompanyId;
    }

    const asset = await AssetHierarchy.findOne({
      where: whereClause,
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
    console.error('Error retrieving asset by external ID:', error);
    const response = errorResponse(
      error.message || `Error retrieving Asset with external ID ${req.params.externalId}`,
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
        resultSummary: upload.resultSummary, // Processing results (created/updated/unchanged counts)
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

    // Parse error information
    let errorSummary = null;
    let parsedErrors = null;
    
    if (upload.errorMessage) {
      const firstLine = upload.errorMessage.split('\n')[0];
      
      // Check if it's a validation error with count
      const validationMatch = firstLine.match(/Validation failed: (\d+) error\(s\) found in (\d+) rows/);
      if (validationMatch) {
        errorSummary = `${validationMatch[1]} validation error(s) in ${validationMatch[2]} rows`;
        
        // Parse structured errors from the message
        parsedErrors = parseErrorMessage(upload.errorMessage);
      } else {
        // For system errors, use the first line
        errorSummary = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
      }
    }

    // Format the response data
    const uploadStatus = {
      id: upload.id,
      fileName: upload.originalName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      status: upload.status,
      errorMessage: upload.errorMessage,
      errorSummary: errorSummary,
      errors: parsedErrors,
      resultSummary: upload.resultSummary,
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

/**
 * Parse structured errors from error message text
 * @param {string} errorMessage - Full error message
 * @returns {Array|null} Array of parsed error objects or null
 */
const parseErrorMessage = (errorMessage) => {
  if (!errorMessage) return null;
  
  const errors = [];
  const lines = errorMessage.split('\n');
  
  // Pattern: "Row X [field] "value": message" or "Row X: message"
  const rowErrorPattern = /^Row (\d+)(?:\s*\[(\w+)\])?(?:\s*"([^"]*)")?:\s*(.+)$/;
  // Pattern for non-row errors: "• message"
  const bulletPattern = /^[•]\s*(.+)$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    const rowMatch = trimmed.match(rowErrorPattern);
    if (rowMatch) {
      errors.push({
        row: parseInt(rowMatch[1]),
        field: rowMatch[2] || null,
        value: rowMatch[3] || null,
        message: rowMatch[4]
      });
      continue;
    }
    
    const bulletMatch = trimmed.match(bulletPattern);
    if (bulletMatch) {
      errors.push({
        row: null,
        field: null,
        value: null,
        message: bulletMatch[1]
      });
    }
  }
  
  return errors.length > 0 ? errors : null;
}; 

/**
 * Delete an Asset from any company (Universal User only)
 * Bypasses company access restrictions for universal users
 */
exports.deleteUniversal = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      return sendResponse(res, errorResponse(
        'Access denied. Only universal users can delete assets across companies.',
        403
      ));
    }

    const id = req.params.id;
    
    // Find asset without company validation (universal access)
    const asset = await AssetHierarchy.findByPk(id);
    
    if (!asset) {
      return sendResponse(res, errorResponse("Asset not found", 404));
    }

    // For now, do a simple delete without recursive deletion
    // In a production system, you might want to handle child assets differently
    await asset.destroy();

    sendResponse(res, successResponse("Asset deleted successfully by universal user"));

  } catch (error) {
    console.error('Error deleting asset (universal):', error);
    
    // Handle foreign key constraint errors
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return sendResponse(res, errorResponse(
        'Cannot delete asset. It may be referenced by other records or have child assets.',
        409
      ));
    }
    
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while deleting the Asset.",
      500
    ));
  }
};

/**
 * Delete an Asset within the user's company (Admin/Superuser only)
 * Uses Sequelize soft delete (paranoid) - sets deleted_at timestamp
 * Triggers beforeDestroy hook for cascading soft deletes to children
 */
exports.delete = async (req, res) => {
  try {
    const assetId = req.params.id;
    
    // Get user's company ID for scoping
    const userCompanyId = req.user.company_id || req.user.company?.id;
    if (!userCompanyId) {
      return sendResponse(res, errorResponse("User's company information is missing", 400));
    }

    // Find asset scoped to user's company
    const asset = await AssetHierarchy.findOne({
      where: {
        id: assetId,
        companyId: userCompanyId
      }
    });

    if (!asset) {
      return sendResponse(res, errorResponse("Asset not found", 404));
    }

    // Soft delete via Sequelize destroy() - triggers beforeDestroy hook
    // which cascades soft delete to children, task_hazards, and risk_assessments
    await asset.destroy();

    sendResponse(res, successResponse("Asset deleted successfully"));

  } catch (error) {
    console.error('Error deleting asset:', error);

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return sendResponse(res, errorResponse(
        'Cannot delete asset. It may be referenced by other records.',
        409
      ));
    }

    sendResponse(res, errorResponse(
      error.message || "Some error occurred while deleting the Asset.",
      500
    ));
  }
};