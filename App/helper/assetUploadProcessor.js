/**
 * Asset Upload Processor
 * Handles bulk database operations for asset uploads
 */

const db = require('../models');
const { Op } = require('sequelize');

const AssetHierarchy = db.asset_hierarchy;
const Notification = db.notifications;

/**
 * Fields to compare when detecting changes
 * Maps new asset field names to database column names
 */
const COMPARABLE_FIELDS = {
  name: 'name',
  description: 'description',
  cmmsInternalId: 'cmms_internal_id',
  functionalLocation: 'functional_location',
  functionalLocationDesc: 'functional_location_desc',
  functionalLocationLongDesc: 'functional_location_long_desc',
  maintenancePlant: 'maintenance_plant',
  cmmsSystem: 'cmms_system',
  objectType: 'object_type',
  systemStatus: 'system_status',
  make: 'make',
  manufacturer: 'manufacturer',
  serialNumber: 'serial_number',
  parent: 'parent_id'
};

/**
 * Fetch existing assets for a company (including soft-deleted)
 * Returns data needed for validation and processing
 * @param {number} companyId - Company ID
 * @param {Object} transaction - Sequelize transaction (optional)
 * @returns {Object} { existingAssetIds: Set, existingParentMap: Map, existingAssetMap: Map }
 */
const fetchExistingAssets = async (companyId, transaction = null) => {
  const options = {
    where: { companyId },
    raw: true,
    paranoid: false // Include soft-deleted assets for proper handling
  };
  
  if (transaction) {
    options.transaction = transaction;
  }
  
  const existingAssets = await AssetHierarchy.findAll(options);
  
  // For validation, only include active (non-deleted) assets as valid parents
  const activeAssets = existingAssets.filter(a => !a.deleted_at);
  const existingAssetIds = new Set(activeAssets.map(a => a.id));
  const existingParentMap = new Map();
  const existingAssetMap = new Map();
  
  for (const asset of existingAssets) {
    // Include all assets (including soft-deleted) in the map for change detection
    // Mark soft-deleted assets so we know to restore them
    existingAssetMap.set(asset.id, {
      ...asset,
      _isSoftDeleted: asset.deleted_at !== null
    });
    
    // Only include active assets in parent map for validation
    if (asset.parent_id && !asset.deleted_at) {
      existingParentMap.set(asset.id, asset.parent_id);
    }
  }
  
  return { existingAssetIds, existingParentMap, existingAssetMap };
};

/**
 * Compare two values for equality (handling nulls and type coercion)
 * @param {*} newVal - New value from upload
 * @param {*} oldVal - Existing value from database
 * @returns {boolean} True if values are equal
 */
const valuesEqual = (newVal, oldVal) => {
  // Handle nulls and undefined
  const normalizedNew = newVal === undefined || newVal === '' ? null : newVal;
  const normalizedOld = oldVal === undefined || oldVal === '' ? null : oldVal;
  
  // Both null/empty
  if (normalizedNew === null && normalizedOld === null) return true;
  
  // One is null, other isn't
  if (normalizedNew === null || normalizedOld === null) return false;
  
  // String comparison (trim and compare)
  return String(normalizedNew).trim() === String(normalizedOld).trim();
};

/**
 * Check if an asset has changes compared to existing data
 * @param {Object} newAsset - New asset data from upload
 * @param {Object} existingAsset - Existing asset data from database (raw)
 * @returns {boolean} True if asset has changes
 */
const hasChanges = (newAsset, existingAsset) => {
  // Soft-deleted assets always need updating (to restore them)
  if (existingAsset._isSoftDeleted) {
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
 * Preserves original order as much as possible - only moves assets when
 * necessary to satisfy parent dependencies
 * @param {Array<Object>} assets - Array of asset objects with id and parent fields
 * @returns {Array<Object>} Sorted array with parents before children
 */
const sortByDependencyOrder = (assets) => {
  if (assets.length === 0) return assets;

  // Build lookup maps
  const assetById = new Map();
  for (const asset of assets) {
    assetById.set(asset.id, asset);
  }

  const sorted = [];
  const added = new Set();

  /**
   * Recursively add an asset and its ancestors (parents first)
   * @param {Object} asset - Asset to add
   */
  const addWithAncestors = (asset) => {
    if (added.has(asset.id)) return;

    // If this asset has a parent in the upload, add parent first
    if (asset.parent && assetById.has(asset.parent) && !added.has(asset.parent)) {
      addWithAncestors(assetById.get(asset.parent));
    }

    // Now add this asset
    if (!added.has(asset.id)) {
      added.add(asset.id);
      sorted.push(asset);
    }
  };

  // Process assets in original order
  // This ensures we maintain original order except when dependencies require changes
  for (const asset of assets) {
    addWithAncestors(asset);
  }

  return sorted;
};

/**
 * Separate assets into new, changed, and unchanged categories
 * @param {Array<Object>} assetData - Validated asset data objects
 * @param {Map<string, Object>} existingAssetMap - Map of existing assets by ID
 * @returns {Object} { newAssets: Array, changedAssets: Array, unchangedCount: number }
 */
const categorizeAssets = (assetData, existingAssetMap) => {
  const newAssets = [];
  const changedAssets = [];
  let unchangedCount = 0;
  
  for (const asset of assetData) {
    const existingAsset = existingAssetMap.get(asset.id);
    
    if (!existingAsset) {
      // New asset
      newAssets.push(asset);
    } else if (hasChanges(asset, existingAsset)) {
      // Existing asset with changes
      changedAssets.push(asset);
    } else {
      // Existing asset with no changes - skip
      unchangedCount++;
    }
  }
  
  return { newAssets, changedAssets, unchangedCount };
};

/**
 * Bulk insert new assets
 * Uses MySQL's INSERT ... ON DUPLICATE KEY UPDATE for safety
 * Also restores soft-deleted assets if they share the same ID
 * @param {Array<Object>} newAssets - Array of new asset data
 * @param {number} companyId - Company ID
 * @param {Object} transaction - Sequelize transaction
 * @returns {number} Number of assets created
 */
const bulkInsertAssets = async (newAssets, companyId, transaction) => {
  if (newAssets.length === 0) return 0;
  
  // Sort assets so parents are inserted before children (required for FK constraint)
  const sortedAssets = sortByDependencyOrder(newAssets);
  
  // Add companyId, level, and clear deleted_at to each asset
  const assetsToCreate = sortedAssets.map(asset => ({
    ...asset,
    companyId,
    level: 0, // Will be recalculated after all inserts
    deletedAt: null // Restore if soft-deleted
  }));
  
  // Process in chunks to avoid MySQL packet size limits
  const CHUNK_SIZE = 500;
  let totalCreated = 0;
  
  for (let i = 0; i < assetsToCreate.length; i += CHUNK_SIZE) {
    const chunk = assetsToCreate.slice(i, i + CHUNK_SIZE);
    
    await AssetHierarchy.bulkCreate(chunk, {
      transaction,
      ignoreDuplicates: false,
      updateOnDuplicate: [
        'name', 'description', 'cmms_internal_id', 'functional_location',
        'functional_location_desc', 'functional_location_long_desc',
        'maintenance_plant', 'cmms_system', 'object_type', 'system_status',
        'make', 'manufacturer', 'serial_number', 'parent_id', 'upload_order',
        'updated_at', 'deleted_at' // Include deleted_at to restore soft-deleted assets
      ]
    });
    
    totalCreated += chunk.length;
  }
  
  return totalCreated;
};

/**
 * Bulk update existing assets (including restoring soft-deleted ones)
 * @param {Array<Object>} existingAssets - Array of existing asset data to update
 * @param {Object} transaction - Sequelize transaction
 * @returns {number} Number of assets updated
 */
const bulkUpdateAssets = async (existingAssets, transaction) => {
  if (existingAssets.length === 0) return 0;
  
  // Sort assets so parents are updated/restored before children (required for FK constraint)
  const sortedAssets = sortByDependencyOrder(existingAssets);
  
  // Process updates in chunks
  const CHUNK_SIZE = 100;
  let totalUpdated = 0;
  
  for (let i = 0; i < sortedAssets.length; i += CHUNK_SIZE) {
    const chunk = sortedAssets.slice(i, i + CHUNK_SIZE);
    
    // Use Promise.all for parallel updates within chunk
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
        parent: asset.parent,
        uploadOrder: asset.uploadOrder,
        deletedAt: null // Restore if soft-deleted
      }, {
        where: { id: asset.id },
        transaction,
        paranoid: false // Allow updating soft-deleted records
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
  // Fetch all assets with their parent relationships
  const allAssets = await AssetHierarchy.findAll({
    where: { companyId },
    attributes: ['id', 'parent'],
    raw: true,
    transaction
  });
  
  if (allAssets.length === 0) return;
  
  // Build parent-child relationships
  const parentMap = new Map();
  const childrenMap = new Map();
  
  for (const asset of allAssets) {
    parentMap.set(asset.id, asset.parent);
    if (!childrenMap.has(asset.parent)) {
      childrenMap.set(asset.parent, []);
    }
    childrenMap.get(asset.parent).push(asset.id);
  }
  
  // Calculate levels using BFS from root nodes
  const levels = new Map();
  const rootIds = childrenMap.get(null) || [];
  
  // Initialize root nodes at level 0
  const queue = rootIds.map(id => ({ id, level: 0 }));
  
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    levels.set(id, level);
    
    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      queue.push({ id: childId, level: level + 1 });
    }
  }
  
  // Handle orphan assets (parent not in company, set to level 0)
  for (const asset of allAssets) {
    if (!levels.has(asset.id)) {
      levels.set(asset.id, 0);
    }
  }
  
  // Batch update levels
  const levelGroups = new Map(); // level -> array of ids
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level).push(id);
  }
  
  // Update each level group
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
 * @param {Array<Object>} assetData - Validated asset data objects
 * @param {number} companyId - Company ID
 * @param {Map<string, Object>} existingAssetMap - Map of existing assets by ID
 * @returns {Object} Processing results
 */
const processAssetUpload = async (assetData, companyId, existingAssetMap) => {
  const startTime = Date.now();
  
  const result = await db.sequelize.transaction(async (transaction) => {
    // Categorize assets into new, changed, and unchanged
    const { newAssets, changedAssets, unchangedCount } = categorizeAssets(assetData, existingAssetMap);
    
    console.log(`Categorized ${assetData.length} assets: ${newAssets.length} new, ${changedAssets.length} changed, ${unchangedCount} unchanged`);
    
    // Bulk insert new assets
    const createdCount = await bulkInsertAssets(newAssets, companyId, transaction);
    
    // Bulk update only changed assets
    const updatedCount = await bulkUpdateAssets(changedAssets, transaction);
    
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
    
    await Notification.create({
      userId,
      title,
      message,
      type: 'system',
      isRead: false
    });
  } catch (error) {
    // Log but don't fail the upload for notification errors
    console.error('Failed to create upload notification:', error);
  }
};

/**
 * Update file upload status
 * @param {Object} fileUpload - FileUpload model instance
 * @param {string} status - New status
 * @param {Object} details - Additional details (errorMessage, etc.)
 */
const updateUploadStatus = async (fileUpload, status, details = {}) => {
  const updateData = { status };
  
  if (details.errorMessage) {
    updateData.errorMessage = details.errorMessage;
  } else if (status === 'completed') {
    updateData.errorMessage = null;
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

