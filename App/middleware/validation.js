/**
 * Validation middleware functions
 * Provides reusable validation middleware for common patterns
 */

const { validationErrorResponse, errorResponse } = require('../helper/responseHelper');
const { validateRequiredFields, isValidEmail, hasRequiredRole, isValidDate, isValidTime } = require('../helper/validationHelper');

/**
 * Middleware to validate required fields in request body
 * @param {array} requiredFields - Array of required field names
 * @returns {function} Express middleware function
 */
exports.validateRequired = (requiredFields) => {
  return (req, res, next) => {
    const validation = validateRequiredFields(req.body, requiredFields);
    if (validation) {
      return res.status(validation.statusCode).json(validation);
    }
    next();
  };
};

/**
 * Middleware to validate email format in request body
 * @param {string} fieldName - Name of the email field (default: 'email')
 * @returns {function} Express middleware function
 */
exports.validateEmail = (fieldName = 'email') => {
  return (req, res, next) => {
    const email = req.body[fieldName];
    if (email && !isValidEmail(email)) {
      const error = errorResponse(`Invalid ${fieldName} format`, 400);
      return res.status(error.statusCode).json(error);
    }
    next();
  };
};

/**
 * Middleware to check if user has required role
 * @param {array} allowedRoles - Array of allowed roles
 * @returns {function} Express middleware function
 */
exports.requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      const error = errorResponse('Authentication required', 401);
      return res.status(error.statusCode).json(error);
    }

    if (!hasRequiredRole(req.user, allowedRoles)) {
      const error = errorResponse(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`, 
        403
      );
      return res.status(error.statusCode).json(error);
    }

    next();
  };
};

/**
 * Middleware to validate pagination parameters
 * @returns {function} Express middleware function
 */
exports.validatePagination = () => {
  return (req, res, next) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    
    req.pagination = { page, limit, offset };
    next();
  };
};

/**
 * Middleware to sanitize request body inputs
 * @param {array} fields - Array of field names to sanitize
 * @returns {function} Express middleware function
 */
exports.sanitizeInputs = (fields) => {
  return (req, res, next) => {
    if (req.body) {
      fields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = req.body[field]
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .substring(0, 1000); // Limit length
        }
      });
    }
    next();
  };
};

/**
 * Middleware to validate user can only access their own data or admin can access any
 * @param {string} userIdField - Field name containing user ID (default: 'userId')
 * @returns {function} Express middleware function
 */
exports.validateUserAccess = (userIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      const error = errorResponse('Authentication required', 401);
      return res.status(error.statusCode).json(error);
    }

    const targetUserId = req.params[userIdField] || req.body[userIdField];
    
    // Superusers and admins can access any user data
    if (['superuser', 'admin'].includes(req.user.role)) {
      return next();
    }

    // Regular users can only access their own data
    if (parseInt(targetUserId) !== req.user.id) {
      const error = errorResponse('Access denied: Can only access your own data', 403);
      return res.status(error.statusCode).json(error);
    }

    next();
  };
};

/**
 * Middleware to validate JSON body exists
 * @returns {function} Express middleware function
 */
exports.requireJsonBody = () => {
  return (req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
      const error = errorResponse('Request body is required', 400);
      return res.status(error.statusCode).json(error);
    }
    next();
  };
};

/**
 * Middleware to validate ID parameter is a valid integer
 * @param {string} paramName - Parameter name (default: 'id')
 * @returns {function} Express middleware function
 */
exports.validateIdParam = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || isNaN(parseInt(id)) || parseInt(id) <= 0) {
      const error = errorResponse(`Invalid ${paramName} parameter`, 400);
      return res.status(error.statusCode).json(error);
    }
    next();
  };
};

/**
 * Middleware to validate date and time fields
 * @returns {function} Express middleware function
 */
exports.validateDateTime = () => {
  return (req, res, next) => {
    const { date, time } = req.body;
    
    if (date && !isValidDate(date)) {
      const error = errorResponse('Invalid date format. Use YYYY-MM-DD', 400);
      return res.status(error.statusCode).json(error);
    }
    console.log(time);
    if (time && !isValidTime(time)) {
      const error = errorResponse('Invalid time format. Use HH:MM', 400);
      return res.status(error.statusCode).json(error);
    }
    
    next();
  };
};

/**
 * Middleware to validate array field
 * @param {string} fieldName - Name of the array field
 * @param {boolean} required - Whether the field is required
 * @returns {function} Express middleware function
 */
exports.validateArray = (fieldName, required = false) => {
  return (req, res, next) => {
    const field = req.body[fieldName];
    
    if (required && (!field || !Array.isArray(field) || field.length === 0)) {
      const error = errorResponse(`${fieldName} is required and must be a non-empty array`, 400);
      return res.status(error.statusCode).json(error);
    }
    
    if (field && !Array.isArray(field)) {
      const error = errorResponse(`${fieldName} must be an array`, 400);
      return res.status(error.statusCode).json(error);
    }
    
    next();
  };
};

/**
 * Middleware to validate and process search parameters for various controllers
 * @returns {function} Express middleware function
 */
exports.validateSearch = () => {
  return (req, res, next) => {
    const { 
      search, level, systemStatus, objectType, maintenancePlant,
      status, dateFrom, dateTo, riskType, supervisor, individual,
      location, assetSystem, systemLockoutRequired, riskSeverity,
      mitigationStatus, createdAfter, createdBefore, sortBy, sortDirection
    } = req.query;
    
    // Validate level if provided (for asset hierarchy)
    if (level && (isNaN(parseInt(level)) || parseInt(level) < 0)) {
      const error = errorResponse('Level must be a non-negative integer', 400);
      return res.status(error.statusCode).json(error);
    }
    
    // Validate date formats
    const dateFields = { dateFrom, dateTo, createdAfter, createdBefore };
    for (const [fieldName, dateValue] of Object.entries(dateFields)) {
      if (dateValue && isNaN(Date.parse(dateValue))) {
        const error = errorResponse(`${fieldName} must be a valid date`, 400);
        return res.status(error.statusCode).json(error);
      }
    }
    
    // Validate boolean fields
    if (systemLockoutRequired && !['true', 'false'].includes(systemLockoutRequired.toLowerCase())) {
      const error = errorResponse('systemLockoutRequired must be true or false', 400);
      return res.status(error.statusCode).json(error);
    }
    
    // Validate risk severity
    if (riskSeverity && !['high', 'medium', 'low'].includes(riskSeverity.toLowerCase())) {
      const error = errorResponse('riskSeverity must be high, medium, or low', 400);
      return res.status(error.statusCode).json(error);
    }
    
    // Validate mitigation status
    if (mitigationStatus && !['mitigated', 'unmitigated'].includes(mitigationStatus.toLowerCase())) {
      const error = errorResponse('mitigationStatus must be mitigated or unmitigated', 400);
      return res.status(error.statusCode).json(error);
    }
    
    // Validate sort direction
    if (sortDirection && !['ASC', 'DESC'].includes(sortDirection.toUpperCase())) {
      const error = errorResponse('sortDirection must be ASC or DESC', 400);
      return res.status(error.statusCode).json(error);
    }
    
    // Sanitize search term
    if (search) {
      req.query.search = search.trim().substring(0, 100);
    }
    
    // Sanitize string filter parameters
    const stringFields = {
      systemStatus, objectType, maintenancePlant, status, riskType,
      supervisor, individual, location, assetSystem, sortBy
    };
    
    for (const [fieldName, fieldValue] of Object.entries(stringFields)) {
      if (fieldValue) {
        req.query[fieldName] = fieldValue.trim().substring(0, 50);
      }
    }
    
    // Normalize boolean field
    if (systemLockoutRequired) {
      req.query.systemLockoutRequired = systemLockoutRequired.toLowerCase();
    }
    
    // Normalize case-sensitive fields
    if (riskSeverity) {
      req.query.riskSeverity = riskSeverity.toLowerCase();
    }
    
    if (mitigationStatus) {
      req.query.mitigationStatus = mitigationStatus.toLowerCase();
    }
    
    if (sortDirection) {
      req.query.sortDirection = sortDirection.toUpperCase();
    }
    
    next();
  };
};