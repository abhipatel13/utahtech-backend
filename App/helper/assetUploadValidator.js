/**
 * Asset Upload Validator
 * Handles validation logic for bulk asset uploads
 */

/**
 * Create an error object with row context
 * @param {number} row - Row number (1-based, accounting for header)
 * @param {string} field - Field name that has the error
 * @param {string} value - The problematic value
 * @param {string} message - Human-readable error message
 * @returns {Object} Structured error object
 */
const createValidationError = (row, field, value, message) => ({
  row,
  field,
  value: value !== null && value !== undefined ? String(value).substring(0, 100) : null,
  message
});

/**
 * Validate that all IDs in the dataset are unique
 * @param {Array<Object>} rows - Mapped rows with 'id' field
 * @returns {Array<Object>} Array of validation errors
 */
const validateIdUniqueness = (rows) => {
  const errors = [];
  const idOccurrences = new Map(); // id -> array of row numbers
  
  for (const row of rows) {
    const id = row.id;
    const rowNum = row._originalRowIndex;
    
    if (!id || id.trim() === '') {
      errors.push(createValidationError(
        rowNum,
        'id',
        id,
        'ID is required but missing or empty'
      ));
      continue;
    }
    
    const trimmedId = id.trim();
    if (!idOccurrences.has(trimmedId)) {
      idOccurrences.set(trimmedId, []);
    }
    idOccurrences.get(trimmedId).push(rowNum);
  }
  
  // Find duplicates
  for (const [id, rowNumbers] of idOccurrences) {
    if (rowNumbers.length > 1) {
      // Add error for each duplicate occurrence
      for (const rowNum of rowNumbers) {
        const otherRows = rowNumbers.filter(r => r !== rowNum);
        errors.push(createValidationError(
          rowNum,
          'id',
          id,
          `Duplicate ID - this value also appears on row${otherRows.length > 1 ? 's' : ''} ${otherRows.join(', ')}`
        ));
      }
    }
  }
  
  return errors;
};

/**
 * Validate required fields are present
 * @param {Array<Object>} rows - Mapped rows
 * @returns {Array<Object>} Array of validation errors
 */
const validateRequiredFields = (rows) => {
  const errors = [];
  
  for (const row of rows) {
    const rowNum = row._originalRowIndex;
    
    // Name is required
    if (!row.name || row.name.trim() === '') {
      errors.push(createValidationError(
        rowNum,
        'name',
        row.name,
        'Name is required but missing or empty'
      ));
    }
  }
  
  return errors;
};

/**
 * Validate parent references exist in either the file or database
 * @param {Array<Object>} rows - Mapped rows with 'id' and 'parent_id' fields
 * @param {Set<string>} existingAssetIds - Set of existing asset IDs from database
 * @returns {Object} { errors: Array, parentMap: Map<childId, parentId> }
 */
const validateParentReferences = (rows, existingAssetIds) => {
  const errors = [];
  const parentMap = new Map();
  
  // Build set of IDs in the current upload
  const uploadIds = new Set();
  for (const row of rows) {
    if (row.id && row.id.trim()) {
      uploadIds.add(row.id.trim());
    }
  }
  
  // Validate each parent reference
  for (const row of rows) {
    const rowNum = row._originalRowIndex;
    const parentId = row.parent_id;
    
    if (!parentId || parentId.trim() === '') {
      // No parent - this is a root asset, which is valid
      continue;
    }
    
    const trimmedParentId = parentId.trim();
    const trimmedId = row.id?.trim();
    
    // Check if parent exists in upload or database
    const parentInUpload = uploadIds.has(trimmedParentId);
    const parentInDb = existingAssetIds.has(trimmedParentId);
    
    if (!parentInUpload && !parentInDb) {
      errors.push(createValidationError(
        rowNum,
        'parent_id',
        trimmedParentId,
        `Parent asset "${trimmedParentId}" does not exist in the file or database`
      ));
    } else if (trimmedId) {
      // Store valid parent relationship for cycle detection
      parentMap.set(trimmedId, trimmedParentId);
    }
  }
  
  return { errors, parentMap };
};

/**
 * Detect cyclic dependencies in parent-child relationships
 * @param {Map<string, string>} parentMap - Map of childId -> parentId
 * @param {Map<string, string>} existingParentMap - Map of existing assets' childId -> parentId
 * @returns {Array<Object>} Array of validation errors for cycles
 */
const detectCyclicDependencies = (parentMap, existingParentMap) => {
  const errors = [];
  
  // Merge upload parent map with existing parent map
  // Upload takes precedence (it's the source of truth for assets it contains)
  const fullParentMap = new Map(existingParentMap);
  for (const [childId, parentId] of parentMap) {
    fullParentMap.set(childId, parentId);
  }
  
  // Find cycles using DFS
  const visited = new Set();
  const inCurrentPath = new Set();
  const cyclesFound = new Set(); // Track unique cycles to avoid duplicates
  
  const findCycle = (nodeId, path = []) => {
    if (inCurrentPath.has(nodeId)) {
      // Found a cycle - build the cycle path
      const cycleStart = path.indexOf(nodeId);
      const cyclePath = [...path.slice(cycleStart), nodeId];
      return cyclePath;
    }
    
    if (visited.has(nodeId)) {
      return null;
    }
    
    visited.add(nodeId);
    inCurrentPath.add(nodeId);
    path.push(nodeId);
    
    const parentId = fullParentMap.get(nodeId);
    if (parentId) {
      const cycle = findCycle(parentId, path);
      if (cycle) {
        return cycle;
      }
    }
    
    inCurrentPath.delete(nodeId);
    path.pop();
    return null;
  };
  
  // Check each node in the upload for cycles
  for (const [childId] of parentMap) {
    visited.clear();
    inCurrentPath.clear();
    
    const cycle = findCycle(childId, []);
    if (cycle) {
      const cycleKey = [...cycle].sort().join('->');
      if (!cyclesFound.has(cycleKey)) {
        cyclesFound.add(cycleKey);
        const cycleStr = cycle.join(' → ');
        errors.push(createValidationError(
          null, // Cycles may span multiple rows
          null,
          null,
          `Cyclic dependency detected: ${cycleStr}`
        ));
      }
    }
  }
  
  return errors;
};

/**
 * Build asset data objects from mapped rows with defaults
 * @param {Array<Object>} rows - Mapped rows
 * @returns {Array<Object>} Array of asset data objects ready for database
 */
const buildAssetDataObjects = (rows) => {
  return rows.map(row => {
    const id = row.id?.trim();
    const name = row.name?.trim();
    
    return {
      id,
      name,
      description: row.description?.trim() || null,
      cmmsInternalId: row.cmms_internal_id?.trim() || id,
      functionalLocation: row.functional_location?.trim() || id,
      functionalLocationDesc: row.functional_location_desc?.trim() || name,
      functionalLocationLongDesc: row.functional_location_long_desc?.trim() || 
        row.functional_location_desc?.trim() || name,
      maintenancePlant: row.maintenance_plant?.trim() || 'Default Plant',
      cmmsSystem: row.cmms_system?.trim() || 'Default System',
      objectType: row.object_type?.trim() || 'Equipment',
      systemStatus: row.system_status?.trim() || 'Active',
      make: row.make?.trim() || null,
      manufacturer: row.manufacturer?.trim() || null,
      serialNumber: row.serial_number?.trim() || null,
      parent: row.parent_id?.trim() || null,
      uploadOrder: row._originalRowIndex - 1 // 0-based upload order
    };
  });
};

/**
 * Run all validations on the upload data
 * @param {Array<Object>} mappedRows - Rows with system field names
 * @param {Set<string>} existingAssetIds - Existing asset IDs from database
 * @param {Map<string, string>} existingParentMap - Existing parent relationships
 * @returns {Object} { valid: boolean, errors: Array, assetData: Array }
 */
const validateUploadData = (mappedRows, existingAssetIds, existingParentMap) => {
  const allErrors = [];
  
  // 1. Validate ID uniqueness
  const idErrors = validateIdUniqueness(mappedRows);
  allErrors.push(...idErrors);
  
  // 2. Validate required fields
  const requiredErrors = validateRequiredFields(mappedRows);
  allErrors.push(...requiredErrors);
  
  // 3. Validate parent references
  const { errors: parentErrors, parentMap } = validateParentReferences(
    mappedRows, 
    existingAssetIds
  );
  allErrors.push(...parentErrors);
  
  // 4. Detect cyclic dependencies (only if no parent reference errors)
  if (parentErrors.length === 0) {
    const cycleErrors = detectCyclicDependencies(parentMap, existingParentMap);
    allErrors.push(...cycleErrors);
  }
  
  // Sort errors by row number
  allErrors.sort((a, b) => {
    if (a.row === null && b.row === null) return 0;
    if (a.row === null) return 1;
    if (b.row === null) return -1;
    return a.row - b.row;
  });
  
  // Build asset data if validation passes
  let assetData = [];
  if (allErrors.length === 0) {
    assetData = buildAssetDataObjects(mappedRows);
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    assetData,
    summary: {
      totalRows: mappedRows.length,
      errorCount: allErrors.length
    }
  };
};

/**
 * Generate a user-friendly error report
 * @param {Array<Object>} errors - Array of validation error objects
 * @param {number} totalRows - Total number of rows processed
 * @returns {string} Formatted error report
 */
const generateErrorReport = (errors, totalRows) => {
  if (errors.length === 0) {
    return null;
  }
  
  const maxErrorsToShow = 20;
  let report = `Validation failed: ${errors.length} error(s) found in ${totalRows} rows\n\n`;
  
  const errorsToShow = errors.slice(0, maxErrorsToShow);
  
  for (const error of errorsToShow) {
    if (error.row) {
      report += `Row ${error.row}`;
      if (error.field) {
        report += ` [${error.field}]`;
      }
      if (error.value) {
        report += ` "${error.value}"`;
      }
      report += `: ${error.message}\n`;
    } else {
      report += `• ${error.message}\n`;
    }
  }
  
  if (errors.length > maxErrorsToShow) {
    report += `\n... and ${errors.length - maxErrorsToShow} more error(s).\n`;
  }
  
  report += '\nPlease fix these issues and re-upload the file.';
  
  return report;
};

module.exports = {
  createValidationError,
  validateIdUniqueness,
  validateRequiredFields,
  validateParentReferences,
  detectCyclicDependencies,
  buildAssetDataObjects,
  validateUploadData,
  generateErrorReport
};




