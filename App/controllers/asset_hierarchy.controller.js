const db = require("../models");
const { Op } = require('sequelize');
const csv = require('csv-parse/sync');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { sanitizeInput } = require('../helper/validationHelper');

const AssetHierarchy = db.asset_hierarchy;
const TaskHazards = db.task_hazards;
const FileUpload = db.file_uploads;
const User = db.user;
const RiskAssessments = db.risk_assessments;

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

    const result = await db.sequelize.transaction(async (t) => {
      // Create file upload record
      const fileUpload = await FileUpload.create({
        fileName: req.file.filename || `${Date.now()}-${sanitizeInput(req.file.originalname)}`,
        originalName: sanitizeInput(req.file.originalname),
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploaderId: req.user.id,
        companyId: userCompanyId,
        status: 'uploading'
      }, { transaction: t });

      // Parse CSV from buffer directly
      const csvString = req.file.buffer.toString('utf-8');
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

      // Get all existing assets
      const existingAssets = await AssetHierarchy.findAll({
        where: {
          companyId: userCompanyId
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
          description: asset['description'] || null,
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
          where: { companyId: userCompanyId },
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
            id: { [Op.in]: assetsToDelete }
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
            level: 0 // Will be recalculated later
          }, { transaction: t });
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
        await asset.update({ level: level }, { transaction: t });
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

      return { finalAssets, fileUpload };
    });

    const response = successResponse('CSV processed successfully', {
      assets: result.finalAssets,
      fileUpload: result.fileUpload
    });
    sendResponse(res, response);

  } catch (error) {
    console.error('Error in uploadCSV:', error);
    const response = errorResponse(
      'Error processing CSV',
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
    const formattedUploads = uploads.map(upload => ({
      id: upload.id,
      fileName: upload.originalName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      status: upload.status,
      uploadedBy: upload.uploadedBy?.name || 'Unknown',
      uploadedAt: upload.createdAt
    }));

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