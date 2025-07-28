/**
 * Common validation helper functions
 * Provides reusable validation logic across controllers
 */

const { validationErrorResponse } = require('./responseHelper');

/**
 * Validate required fields in request body
 * @param {object} body - Request body
 * @param {array} requiredFields - Array of required field names
 * @returns {object|null} Validation error response or null if valid
 */
exports.validateRequiredFields = (body, requiredFields) => {
  const errors = [];
  
  requiredFields.forEach(field => {
    if (!body[field] || body[field] === '') {
      errors.push(`${field} is required`);
    }
  });
  
  return errors.length > 0 ? validationErrorResponse(errors) : null;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
exports.isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result with isValid and errors
 */
exports.validatePassword = (password) => {
  const errors = [];
  
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate user role
 * @param {string} role - Role to validate
 * @returns {boolean} True if valid role
 */
exports.isValidRole = (role) => {
  const validRoles = ['superuser', 'admin', 'supervisor', 'user'];
  return validRoles.includes(role);
};

/**
 * Check if user has required role
 * @param {object} user - User object
 * @param {array} allowedRoles - Array of allowed roles
 * @returns {boolean} True if user has required role
 */
exports.hasRequiredRole = (user, allowedRoles) => {
  return user && allowedRoles.includes(user.role);
};

/**
 * Validate company access
 * @param {object} user - User object
 * @param {number} companyId - Company ID to validate access to
 * @returns {boolean} True if user has access to company
 */
exports.hasCompanyAccess = (user, companyId) => {
  if (!user || !user.company_id) return false;
  
  // Other users can only access their own company
  return user.company_id === companyId;
};

/**
 * Sanitize input string
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
exports.sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

/**
 * Validate pagination parameters
 * @param {object} query - Query parameters
 * @returns {object} Validated pagination parameters
 */
exports.validatePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
};

/**
 * Validate date format (YYYY-MM-DD)
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid date format
 */
exports.isValidDate = (dateString) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

/**
 * Validate time format (HH:MM) or (HH:MM:SS)
 * @param {string} timeString - Time string to validate
 * @returns {boolean} True if valid time format
 */
exports.isValidTime = (timeString) => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]?(:[0-5][0-9])?$/;
  return timeRegex.test(timeString)
};