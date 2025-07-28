/**
 * Standardized response helper functions
 * Provides consistent API response formats across all controllers
 */

/**
 * Create a standardized success response
 * @param {string} message - Success message
 * @param {any} data - Optional data to include
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {object} Standardized success response
 */
exports.successResponse = (message, data = null, statusCode = 200) => {
  const response = {
    status: true,
    statusCode,
    message
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  return response;
};

/**
 * Create a standardized error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {any} details - Optional error details
 * @param {string} code - Optional error code
 * @returns {object} Standardized error response
 */
exports.errorResponse = (message, statusCode = 400, details = null, code = null) => {
  const response = {
    status: false,
    statusCode,
    message
  };
  
  if (details !== null) {
    response.details = details;
  }
  
  if (code !== null) {
    response.code = code;
  }
  
  return response;
};

/**
 * Create a validation error response
 * @param {array} errors - Array of validation errors
 * @param {string} message - Optional custom message
 * @returns {object} Standardized validation error response
 */
exports.validationErrorResponse = (errors, message = 'Validation failed') => {
  return {
    status: false,
    statusCode: 400,
    message,
    errors
  };
};

/**
 * Create a paginated response
 * @param {array} data - Array of data items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} message - Optional message
 * @returns {object} Standardized paginated response
 */
exports.paginatedResponse = (data, page, limit, total, message = 'Data retrieved successfully') => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    status: true,
    statusCode: 200,
    message,
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Send standardized response
 * @param {object} res - Express response object
 * @param {object} responseData - Response data from helper functions
 */
exports.sendResponse = (res, responseData) => {
  const { statusCode, ...responseBody } = responseData;
  res.status(statusCode).json(responseBody);
};