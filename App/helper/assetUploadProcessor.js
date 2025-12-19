/**
 * Asset Upload Processor
 * Handles bulk database operations for asset uploads
 * Updated for Internal/External ID System
 */

const db = require('../models');
const { Op } = require('sequelize');
const { v7: uuidv7 } = require('uuid');

const AssetHierarchy = db.asset_hierarchy;
const { createNotification } = require('../controllers/notificationController');

/**
 * Fields to compare when detecting changes
 * Maps new asset field names to existing asset field names (both camelCase)
 */
const COMPARABLE_FIELDS = {
  name: 'name',
  description: 'description',
  cmmsInternalId: 'cmmsInternalId',
  functionalLocation: 'functionalLocation',
  functionalLocationDesc: 'functionalLocationDesc',
  functionalLocationLongDesc: 'functionalLocationLongDesc',
  maintenancePlant: 'maintenancePlant',
  cmmsSystem: 'cmmsSystem',
  objectType: 'objectType',
  systemStatus: 'systemStatus',
  make: 'make',
  manufacturer: 'manufacturer',
  serialNumber: 'serialNumber'
  // Note: parent comparison is handled separately due to ID mapping
};

/**
 * Fetch existing assets for a company
 * Returns maps for both internal and external ID lookups
 * @param {number} companyId - Company ID
 * @param {Object} transaction - Sequelize transaction (optional)
 * @returns {Object} { existingByExternalId, existingByInternalId, existingAssetIds, existingParentMap, externalToInternalMap }
 */
const fetchExistingAssets = async (companyId, transaction = null) => {
  const options = {
    where: { companyId },
    paranoid: false // Include soft-deleted assets for proper handling
  };
  
  if (transaction) {
    options.transaction = transaction;
  }
  
  const existingAssets = await AssetHierarchy.findAll(options);
  
  // Map by external ID (for matching uploaded data)
  const existingByExternalId = new Map();
  // Map by internal ID (for parent lookups)
  const existingByInternalId = new Map();
  // Set of external IDs (for validation)
  const existingAssetIds = new Set();
  // Map of external ID -> internal ID (for parent resolution)
  const externalToInternalMap = new Map();
  
  for (const asset of existingAssets) {
    // Convert model instance to plain object for consistent access
    const plainAsset = asset.get({ plain: true });
    const isSoftDeleted = plainAsset.deletedAt !== null;
    
    existingByInternalId.set(plainAsset.id, {
      ...plainAsset,
      _isSoftDeleted: isSoftDeleted
    });
    
    existingByExternalId.set(plainAsset.externalId, {
      ...plainAsset,
      _isSoftDeleted: isSoftDeleted
    });
    
    if (!isSoftDeleted) {
      existingAssetIds.add(plainAsset.externalId);
      externalToInternalMap.set(plainAsset.externalId, plainAsset.id);
    }
  }
  
  // Build parent map using external IDs for validation
  // Filter active assets using the plain object data
  const existingParentMap = new Map();
  for (const [, assetData] of existingByInternalId) {
    if (!assetData._isSoftDeleted && assetData.parent) {
      // Find parent's external ID
      const parentAsset = existingByInternalId.get(assetData.parent);
      if (parentAsset) {
        existingParentMap.set(assetData.externalId, parentAsset.externalId);
      }
    }
  }
  
  return { 
    existingByExternalId, 
    existingByInternalId, 
    existingAssetIds, 
    existingParentMap,
    externalToInternalMap
  };
};

/**
 * Compare two values for equality (handling nulls and type coercion)
 * @param {*} newVal - New value from upload
 * @param {*} oldVal - Existing value from database
 * @returns {boolean} True if values are equal
 */
const valuesEqual = (newVal, oldVal) => {
  const normalizedNew = newVal === undefined || newVal === '' ? null : newVal;
  const normalizedOld = oldVal === undefined || oldVal === '' ? null : oldVal;
  
  if (normalizedNew === null && normalizedOld === null) return true;
  if (normalizedNew === null || normalizedOld === null) return false;
  
  return String(normalizedNew).trim() === String(normalizedOld).trim();
};

/**
 * Check if an asset has changes compared to existing data
 * @param {Object} newAsset - New asset data from upload
 * @param {Object} existingAsset - Existing asset data from database
 * @param {string|null} newParentExternalId - New parent's external ID
 * @param {string|null} existingParentExternalId - Existing parent's external ID
 * @returns {boolean} True if asset has changes
 */
const hasChanges = (newAsset, existingAsset, newParentExternalId, existingParentExternalId) => {
  // Soft-deleted assets always need updating (to restore them)
  if (existingAsset._isSoftDeleted) {
    return true;
  }
  
  // Check parent change (compare external IDs)
  if (!valuesEqual(newParentExternalId, existingParentExternalId)) {
    return true;
  }
  
  for (const [newField, dbColumn] of Object.entries(COMPARABLE_FIELDS)) {
    const newVal = newAsset[newField];
    const oldVal = existingAsset[dbColumn];
    
    if (!valuesEqual(newVal, oldVal)) {
      return true;
    }
  }
  return false;
};

/**
 * Sort assets so parents come before children (stable topological sort)
 * Uses external IDs for dependency resolution
 * @param {Array<Object>} assets - Array of asset objects with externalId and parentExternalId fields
 * @returns {Array<Object>} Sorted array with parents before children
 */
const sortByDependencyOrder = (assets) => {
  if (assets.length === 0) return assets;

  const assetByExternalId = new Map();
  for (const asset of assets) {
    assetByExternalId.set(asset.externalId, asset);
  }

  const sorted = [];
  const added = new Set();

  const addWithAncestors = (asset) => {
    if (added.has(asset.externalId)) return;

    // parentExternalId is the external ID of the parent
    if (asset.parentExternalId && assetByExternalId.has(asset.parentExternalId) && !added.has(asset.parentExternalId)) {
      addWithAncestors(assetByExternalId.get(asset.parentExternalId));
    }

    if (!added.has(asset.externalId)) {
      added.add(asset.externalId);
      sorted.push(asset);
    }
  };

  for (const asset of assets) {
    addWithAncestors(asset);
  }

  return sorted;
};

/**
 * Categorize assets into new, changed, and unchanged
 * @param {Array<Object>} assetData - Asset data with externalId and parentExternalId fields
 * @param {Map<string, Object>} existingByExternalId - Existing assets by external ID
 * @param {Map<string, string>} existingParentMap - Existing parent relationships (external ID -> parent external ID)
 */
const categorizeAssets = (assetData, existingByExternalId, existingParentMap) => {
  const newAssets = [];
  const changedAssets = [];
  let unchangedCount = 0;
  
  for (const asset of assetData) {
    const existingAsset = existingByExternalId.get(asset.externalId);
    
    if (!existingAsset) {
      newAssets.push(asset);
    } else {
      const existingParentExternalId = existingParentMap.get(asset.externalId) || null;
      
      if (hasChanges(asset, existingAsset, asset.parentExternalId, existingParentExternalId)) {
        // Attach internal ID for update
        changedAssets.push({
          ...asset,
          id: existingAsset.id  // Use existing internal ID
        });
      } else {
        unchangedCount++;
      }
    }
  }
  
  return { newAssets, changedAssets, unchangedCount };
};

/**
 * Resolve parent external IDs to internal IDs
 * @param {Array<Object>} assets - Assets with parentExternalId
 * @param {Map<string, string>} externalToInternalMap - Existing mapping
 * @param {Map<string, string>} newAssetIdMap - New assets' external -> internal ID mapping
 */
const resolveParentIds = (assets, externalToInternalMap, newAssetIdMap) => {
  return assets.map(asset => {
    let parentInternalId = null;
    
    if (asset.parentExternalId) {
      // First check new assets (from this upload)
      parentInternalId = newAssetIdMap.get(asset.parentExternalId);
      
      // Then check existing assets
      if (!parentInternalId) {
        parentInternalId = externalToInternalMap.get(asset.parentExternalId);
      }
    }
    
    return {
      ...asset,
      parent: parentInternalId  // Internal ID for database
    };
  });
};

/**
 * Bulk insert new assets
 * @param {Array<Object>} newAssets - Array of new asset data
 * @param {number} companyId - Company ID
 * @param {Map<string, string>} externalToInternalMap - Existing external to internal ID mapping
 * @param {Object} transaction - Sequelize transaction
 * @returns {Object} { count: number, idMap: Map<string, string> }
 */
const bulkInsertAssets = async (newAssets, companyId, externalToInternalMap, transaction) => {
  if (newAssets.length === 0) return { count: 0, idMap: new Map() };
  
  // Sort so parents are inserted first
  const sortedAssets = sortByDependencyOrder(newAssets);
  
  // Generate internal IDs for all new assets
  const newAssetIdMap = new Map();
  for (const asset of sortedAssets) {
    newAssetIdMap.set(asset.externalId, uuidv7());
  }
  
  // Resolve parent IDs
  const assetsWithParents = resolveParentIds(sortedAssets, externalToInternalMap, newAssetIdMap);
  
  // Prepare for insert
  const assetsToCreate = assetsWithParents.map(asset => ({
    id: newAssetIdMap.get(asset.externalId),
    externalId: asset.externalId,
    companyId,
    name: asset.name,
    description: asset.description,
    cmmsInternalId: asset.cmmsInternalId,
    functionalLocation: asset.functionalLocation,
    functionalLocationDesc: asset.functionalLocationDesc,
    functionalLocationLongDesc: asset.functionalLocationLongDesc,
    maintenancePlant: asset.maintenancePlant,
    cmmsSystem: asset.cmmsSystem,
    objectType: asset.objectType,
    systemStatus: asset.systemStatus || 'Active',
    make: asset.make,
    manufacturer: asset.manufacturer,
    serialNumber: asset.serialNumber,
    parent: asset.parent,  // Already resolved to internal ID
    uploadOrder: asset.uploadOrder,
    level: 0,
    deletedAt: null
  }));
  
  const CHUNK_SIZE = 500;
  let totalCreated = 0;
  
  for (let i = 0; i < assetsToCreate.length; i += CHUNK_SIZE) {
    const chunk = assetsToCreate.slice(i, i + CHUNK_SIZE);
    
    await AssetHierarchy.bulkCreate(chunk, {
      transaction,
      ignoreDuplicates: false
    });
    
    totalCreated += chunk.length;
  }
  
  return { count: totalCreated, idMap: newAssetIdMap };
};

/**
 * Bulk update existing assets
 * @param {Array<Object>} changedAssets - Array of changed asset data with internal id
 * @param {Map<string, string>} externalToInternalMap - Existing external to internal ID mapping
 * @param {Map<string, string>} newAssetIdMap - New assets' external -> internal ID mapping
 * @param {Object} transaction - Sequelize transaction
 * @returns {number} Number of assets updated
 */
const bulkUpdateAssets = async (changedAssets, externalToInternalMap, newAssetIdMap, transaction) => {
  if (changedAssets.length === 0) return 0;
  
  const sortedAssets = sortByDependencyOrder(changedAssets);
  
  // Resolve parent IDs
  const assetsWithParents = resolveParentIds(sortedAssets, externalToInternalMap, newAssetIdMap);
  
  const CHUNK_SIZE = 100;
  let totalUpdated = 0;
  
  for (let i = 0; i < assetsWithParents.length; i += CHUNK_SIZE) {
    const chunk = assetsWithParents.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(asset => 
      AssetHierarchy.update({
        name: asset.name,
        description: asset.description,
        cmmsInternalId: asset.cmmsInternalId,
        functionalLocation: asset.functionalLocation,
        functionalLocationDesc: asset.functionalLocationDesc,
        functionalLocationLongDesc: asset.functionalLocationLongDesc,
        maintenancePlant: asset.maintenancePlant,
        cmmsSystem: asset.cmmsSystem,
        objectType: asset.objectType,
        systemStatus: asset.systemStatus,
        make: asset.make,
        manufacturer: asset.manufacturer,
        serialNumber: asset.serialNumber,
        parent: asset.parent,  // Internal ID
        uploadOrder: asset.uploadOrder,
        deletedAt: null
      }, {
        where: { id: asset.id },  // Use internal ID
        transaction,
        paranoid: false
      })
    ));
    
    totalUpdated += chunk.length;
  }
  
  return totalUpdated;
};

/**
 * Recalculate hierarchy levels for all company assets
 * Uses iterative approach instead of recursive for better performance
 * @param {number} companyId - Company ID
 * @param {Object} transaction - Sequelize transaction
 */
const recalculateHierarchyLevels = async (companyId, transaction) => {
  const allAssets = await AssetHierarchy.findAll({
    where: { companyId },
    attributes: ['id', 'parent'],
    transaction
  });
  
  if (allAssets.length === 0) return;
  
  const parentMap = new Map();
  const childrenMap = new Map();
  
  for (const asset of allAssets) {
    parentMap.set(asset.id, asset.parent);
    if (!childrenMap.has(asset.parent)) {
      childrenMap.set(asset.parent, []);
    }
    childrenMap.get(asset.parent).push(asset.id);
  }
  
  const levels = new Map();
  const rootIds = childrenMap.get(null) || [];
  const queue = rootIds.map(id => ({ id, level: 0 }));
  
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    levels.set(id, level);
    
    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      queue.push({ id: childId, level: level + 1 });
    }
  }
  
  for (const asset of allAssets) {
    if (!levels.has(asset.id)) {
      levels.set(asset.id, 0);
    }
  }
  
  const levelGroups = new Map();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level).push(id);
  }
  
  for (const [level, ids] of levelGroups) {
    if (ids.length > 0) {
      await AssetHierarchy.update(
        { level },
        {
          where: { 
            id: { [Op.in]: ids },
            companyId 
          },
          transaction
        }
      );
    }
  }
};

/**
 * Process the validated asset upload
 * @param {Array<Object>} assetData - Validated asset data objects with externalId and parentExternalId
 * @param {number} companyId - Company ID
 * @param {Object} existingData - Data from fetchExistingAssets
 * @returns {Object} Processing results
 */
const processAssetUpload = async (assetData, companyId, existingData) => {
  const startTime = Date.now();
  const { existingByExternalId, existingParentMap, externalToInternalMap } = existingData;
  
  const result = await db.sequelize.transaction(async (transaction) => {
    // Categorize assets
    const { newAssets, changedAssets, unchangedCount } = categorizeAssets(
      assetData, 
      existingByExternalId, 
      existingParentMap
    );
    
    console.log(`Categorized ${assetData.length} assets: ${newAssets.length} new, ${changedAssets.length} changed, ${unchangedCount} unchanged`);
    
    // Insert new assets (returns map of new external -> internal IDs)
    const { count: createdCount, idMap: newAssetIdMap } = await bulkInsertAssets(
      newAssets, 
      companyId, 
      externalToInternalMap, 
      transaction
    );
    
    // Merge new IDs into the mapping for update phase
    const allExternalToInternalMap = new Map([...externalToInternalMap, ...newAssetIdMap]);
    
    // Update changed assets
    const updatedCount = await bulkUpdateAssets(
      changedAssets, 
      allExternalToInternalMap, 
      newAssetIdMap, 
      transaction
    );
    
    // Recalculate hierarchy levels (only if we made changes)
    if (createdCount > 0 || updatedCount > 0) {
      await recalculateHierarchyLevels(companyId, transaction);
    }
    
    return {
      createdCount,
      updatedCount,
      unchangedCount,
      totalProcessed: assetData.length
    };
  });
  
  const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  return {
    ...result,
    processingTime: `${processingTime}s`
  };
};

/**
 * Create a notification for the uploader
 * @param {number} userId - User ID to notify
 * @param {string} status - Upload status ('success' or 'error')
 * @param {string} fileName - Name of the uploaded file
 * @param {Object} details - Additional details (counts, error message, etc.)
 */
const createUploadNotification = async (userId, status, fileName, details = {}) => {
  try {
    const isSuccess = status === 'success';
    const title = isSuccess ? 'Asset Upload Complete' : 'Asset Upload Failed';
    
    let message;
    if (isSuccess) {
      const parts = [];
      if (details.createdCount > 0) parts.push(`${details.createdCount} created`);
      if (details.updatedCount > 0) parts.push(`${details.updatedCount} updated`);
      if (details.unchangedCount > 0) parts.push(`${details.unchangedCount} unchanged`);
      
      const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
      message = `Your file "${fileName}" was processed successfully. ${summary}.`;
    } else {
      message = `Your file "${fileName}" failed to process. ${details.errorSummary || 'Please check the upload status for details.'}`;
    }
    
    await createNotification(userId, title, message, 'system');
  } catch (error) {
    console.error('Failed to create upload notification:', error);
  }
};

/**
 * Update file upload status
 * @param {Object} fileUpload - FileUpload model instance
 * @param {string} status - New status
 * @param {Object} details - Additional details (errorMessage, resultSummary, etc.)
 */
const updateUploadStatus = async (fileUpload, status, details = {}) => {
  const updateData = { status };
  
  if (details.errorMessage) {
    updateData.errorMessage = details.errorMessage;
  } else if (status === 'completed') {
    updateData.errorMessage = null;
  }
  
  if (details.resultSummary) {
    updateData.resultSummary = details.resultSummary;
  }
  
  await fileUpload.update(updateData);
};

module.exports = {
  fetchExistingAssets,
  sortByDependencyOrder,
  categorizeAssets,
  bulkInsertAssets,
  bulkUpdateAssets,
  recalculateHierarchyLevels,
  processAssetUpload,
  createUploadNotification,
  updateUploadStatus
};
