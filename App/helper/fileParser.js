/**
 * File Parser Helper
 * Handles parsing of CSV and Excel files for asset upload
 * Updated for Internal/External ID System
 */

const csv = require('csv-parse/sync');
const XLSX = require('xlsx');

/**
 * Supported file types and their MIME types
 */
const SUPPORTED_TYPES = {
  CSV: ['text/csv', 'application/csv', 'text/plain'],
  EXCEL: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
  ]
};

/**
 * Detect file type from MIME type and extension
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - Original file name
 * @returns {string|null} 'csv', 'excel', or null if unsupported
 */
const detectFileType = (mimeType, fileName) => {
  const extension = fileName.toLowerCase().split('.').pop();
  
  // Check by extension first (more reliable)
  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  
  // Fall back to MIME type
  if (SUPPORTED_TYPES.CSV.includes(mimeType)) return 'csv';
  if (SUPPORTED_TYPES.EXCEL.includes(mimeType)) return 'excel';
  
  return null;
};

/**
 * Parse CSV buffer to array of objects
 * @param {Buffer} buffer - File buffer
 * @returns {Array<Object>} Array of row objects with headers as keys
 */
const parseCSVBuffer = (buffer) => {
  const csvString = buffer.toString('utf-8');
  
  return csv.parse(csvString, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
};

/**
 * Parse Excel buffer to array of objects
 * @param {Buffer} buffer - File buffer
 * @returns {Array<Object>} Array of row objects with headers as keys
 */
const parseExcelBuffer = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // Get the first sheet
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel file contains no sheets');
  }
  
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON with headers
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '', // Default value for empty cells
    raw: false  // Convert all values to strings
  });
  
  return rows;
};

/**
 * Parse file buffer based on file type
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - Original file name
 * @returns {Object} { rows: Array, fileType: string }
 */
const parseFileBuffer = (buffer, mimeType, fileName) => {
  const fileType = detectFileType(mimeType, fileName);
  
  if (!fileType) {
    throw new Error(
      `Unsupported file type. Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.`
    );
  }
  
  let rows;
  
  if (fileType === 'csv') {
    rows = parseCSVBuffer(buffer);
  } else if (fileType === 'excel') {
    rows = parseExcelBuffer(buffer);
  }
  
  if (!rows || rows.length === 0) {
    throw new Error('File is empty or contains no valid data rows.');
  }
  
  return { rows, fileType };
};

/**
 * Extract column headers from file
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - Original file name
 * @returns {Array<string>} Array of column headers
 */
const extractHeaders = (buffer, mimeType, fileName) => {
  const fileType = detectFileType(mimeType, fileName);
  
  if (!fileType) {
    throw new Error('Unsupported file type');
  }
  
  if (fileType === 'csv') {
    const csvString = buffer.toString('utf-8');
    const parsed = csv.parse(csvString, {
      columns: false,
      skip_empty_lines: true,
      to: 1 // Only parse first row
    });
    return parsed[0] || [];
  }
  
  if (fileType === 'excel') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    return rows[0] || [];
  }
  
  return [];
};

/**
 * Apply column mappings to parsed rows
 * Maps user's column names to system field names
 * Frontend sends 'id' and 'parent_id', we convert to 'externalId' and 'parentExternalId'
 * @param {Array<Object>} rows - Parsed rows with original headers
 * @param {Object} columnMappings - Mapping of system fields to file columns (from frontend)
 * @returns {Array<Object>} Rows with system field names as keys
 */
const applyColumnMappings = (rows, columnMappings) => {
  if (!columnMappings || Object.keys(columnMappings).length === 0) {
    throw new Error('Column mappings are required');
  }
  
  return rows.map((row, index) => {
    const mappedRow = { _originalRowIndex: index + 2 }; // +2 for 1-based index + header row
    
    for (const [systemField, fileColumn] of Object.entries(columnMappings)) {
      if (fileColumn && row.hasOwnProperty(fileColumn)) {
        // Map frontend field names to internal field names
        if (systemField === 'id') {
          // User's 'id' becomes our 'externalId'
          mappedRow.externalId = row[fileColumn]?.toString().trim() || null;
        } else if (systemField === 'parent_id') {
          // User's 'parent_id' becomes our 'parentExternalId'
          mappedRow.parentExternalId = row[fileColumn]?.toString().trim() || null;
        } else {
          mappedRow[systemField] = row[fileColumn]?.toString().trim() || null;
        }
      } else {
        // Set appropriate null values for unmapped fields
        if (systemField === 'id') {
          mappedRow.externalId = null;
        } else if (systemField === 'parent_id') {
          mappedRow.parentExternalId = null;
        } else {
          mappedRow[systemField] = null;
        }
      }
    }
    
    return mappedRow;
  });
};

/**
 * Validate that required column mappings are present
 * @param {Object} columnMappings - Mapping of system fields to file columns
 * @param {Array<string>} fileHeaders - Headers present in the file
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
const validateColumnMappings = (columnMappings, fileHeaders) => {
  const errors = [];
  const requiredFields = ['id', 'name'];
  
  // Check required fields are mapped
  for (const field of requiredFields) {
    if (!columnMappings[field]) {
      errors.push(`Required field '${field}' is not mapped to any column`);
    }
  }
  
  // Check mapped columns exist in file
  const headerSet = new Set(fileHeaders);
  for (const [systemField, fileColumn] of Object.entries(columnMappings)) {
    if (fileColumn && !headerSet.has(fileColumn)) {
      errors.push(
        `Mapped column '${fileColumn}' for field '${systemField}' does not exist in file`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Check if file type is supported
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - Original file name
 * @returns {boolean}
 */
const isFileTypeSupported = (mimeType, fileName) => {
  return detectFileType(mimeType, fileName) !== null;
};

module.exports = {
  detectFileType,
  parseFileBuffer,
  parseCSVBuffer,
  parseExcelBuffer,
  extractHeaders,
  applyColumnMappings,
  validateColumnMappings,
  isFileTypeSupported,
  SUPPORTED_TYPES
};
