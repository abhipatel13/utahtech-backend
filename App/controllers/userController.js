const models = require("../models");
const User = models.user;
const { Op } = require('sequelize');
const bcrypt = require("bcryptjs");
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { isValidEmail, isValidRole } = require('../helper/validationHelper');
const Company = models.company;

// Helper: normalize and validate a single incoming user row
const normalizeIncomingUser = (raw, index) => {
  const normalized = {
    index,
    email: typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : raw.email,
    role: typeof raw.role === 'string' ? raw.role.trim().toLowerCase() : raw.role,
    name: typeof raw.name === 'string' ? raw.name.trim() : raw.name,
    department: typeof raw.department === 'string' ? raw.department.trim() : raw.department,
    phone: typeof raw.phone === 'string' ? raw.phone.trim() : raw.phone,
    company_id: raw.company_id
  };
  return normalized;
};

// Allowed roles for import (exclude universal_user for safety)
const IMPORT_ALLOWED_ROLES = ['superuser','admin','supervisor','user'];

// Determine if actor can manage the given company
const canManageCompany = (actor, companyId) => {
  if (!actor) return false;
  if (actor.role === 'universal_user') return true;
  if (['superuser','admin'].includes(actor.role)) {
    return parseInt(actor.company_id) === parseInt(companyId);
  }
  return false;
};

// Compare if any tracked fields changed
const hasTrackedChanges = (existing, incoming) => {
  const nameChanged = (incoming.name ?? '') !== (existing.name ?? '');
  const roleChanged = (incoming.role ?? '') !== (existing.role ?? '');
  const deptChanged = (incoming.department ?? '') !== (existing.department ?? '');
  const phoneChanged = (incoming.phone ?? '') !== (existing.phone_no ?? '');
  return nameChanged || roleChanged || deptChanged || phoneChanged;
};

module.exports.bulkUpsert = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.users) ? req.body.users : null;

    if (!incoming || incoming.length === 0) {
      const resp = errorResponse('Invalid payload: users must be a non-empty array', 400);
      return sendResponse(res, resp);
    }

    // Normalize
    const rows = incoming.map((u, idx) => normalizeIncomingUser(u, idx));

    // Pre-validate and collect errors; also detect duplicates within request by (email, company_id)
    const failed = [];
    const keySeen = new Set();
    const toProcess = [];
    for (const row of rows) {
      const rowErrors = [];
      if (!row.email || typeof row.email !== 'string' || !isValidEmail(row.email)) {
        rowErrors.push('INVALID_EMAIL_FORMAT');
      }
      if (!row.role || typeof row.role !== 'string' || !IMPORT_ALLOWED_ROLES.includes(row.role)) {
        rowErrors.push('INVALID_ROLE');
      }
      // if (row.company_id === undefined || row.company_id === null || isNaN(parseInt(row.company_id))) {
      //   rowErrors.push('INVALID_COMPANY_ID');
      // }
      // Duplicate-in-request detection
      const sig = `${row.email}`;
      if (keySeen.has(sig)) {
        rowErrors.push('DUPLICATE_IN_REQUEST');
      }

      if (rowErrors.length > 0) {
        failed.push({ email: row.email, index: row.index, errors: rowErrors });
      } else {
        keySeen.add(sig);
        toProcess.push(row);
      }
    }

    // If nothing valid
    if (toProcess.length === 0) {
      const resp = errorResponse('No valid users to process', 422, { failed }, 'ALL_ROWS_INVALID');
      return sendResponse(res, resp);
    }

    // Enforce single company_id per request (business rule)
    // const uniqueCompanyIds = [...new Set(toProcess.map(r => parseInt(r.company_id)))];
    // if (uniqueCompanyIds.length !== 1) {
    //   const resp = errorResponse('All users must target the same company_id', 400, { company_ids: uniqueCompanyIds }, 'MIXED_COMPANY_IDS');
    //   return sendResponse(res, resp);
    // }

    const targetCompanyId = req.user.company_id;
    const targetCompany = await Company.findByPk(targetCompanyId);
    if (!targetCompany) {
      const resp = errorResponse('Invalid company ID', 400, { company_id: targetCompanyId }, 'COMPANY_NOT_FOUND');
      return sendResponse(res, resp);
    }
    // if (!canManageCompany(req.user, targetCompanyId)) {
    //   const resp = errorResponse('Insufficient permissions for this company', 403, { company_id: targetCompanyId }, 'COMPANY_ACCESS_DENIED');
    //   return sendResponse(res, resp);
    // }

    const filtered = toProcess;

    // Process in batches
    const created = [];
    const updated = [];
    const existing = [];

    // Preload existing users by email (global uniqueness in current schema)
    const emailsAll = [...new Set(filtered.map(r => r.email))];
    const existingUsers = await User.findAll({
      where: {
        email: { [Op.in]: emailsAll }
      },
      paranoid: false
    });
    const emailToUser = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]));

    for (const row of filtered) {
        try {
          const found = emailToUser.get(row.email);
          if (!found) {
            // Create
            const newUser = await User.create({
              email: row.email,
              role: row.role,
              name: row.name || null,
              department: row.department || null,
              phone_no: row.phone || null,
              company_id: targetCompanyId,
              password: ''
            });

            created.push({ email: row.email, id: newUser.id, index: row.index });
            // Track for subsequent rows in same batch
            emailToUser.set(row.email, newUser);
            continue;
          }

          if(found.deleted_at !== null){
            failed.push({ email: row.email, index: row.index, errors: ['EMAIL_IN_USE_CONTACT_SUPPORT'] });
            continue;
          }

          // Existing: if user belongs to a different company, do not reassign; fail this row
          if (parseInt(found.company_id) !== parseInt(targetCompanyId)) {
            failed.push({ email: row.email, index: row.index, errors: ['EMAIL_IN_USE_DIFFERENT_COMPANY'] });
            continue;
          }

          const needsUpdate = hasTrackedChanges(found, row);
          if (!needsUpdate) {
            existing.push({ email: row.email, id: found.id, index: row.index });
            continue;
          }

          const updatePayload = {};
          if ((row.name ?? '') !== (found.name ?? '')) updatePayload.name = row.name || null;
          if ((row.role ?? '') !== (found.role ?? '')) updatePayload.role = row.role;
          if ((row.department ?? '') !== (found.department ?? '')) updatePayload.department = row.department || null;
          if ((row.phone ?? '') !== (found.phone_no ?? '')) updatePayload.phone_no = row.phone || null;

          const updatedUser = await found.update(updatePayload);
          updated.push({ email: row.email, id: updatedUser.id, index: row.index });
        } catch (err) {
          // Classify as failed for this row
          const code = err.name === 'SequelizeUniqueConstraintError' ? 'DUPLICATE_EMAIL_IN_DB' : 'ROW_PROCESSING_ERROR';
          failed.push({ email: row.email, index: row.index, errors: [code] });
        }
      }

    const totalProcessed = created.length + updated.length + existing.length + failed.length;
    const response = successResponse('Bulk upsert processed', {
      created,
      updated,
      existing,
      failed
    });

    // Attach pagination-like summary
    response.pagination = {
      totalProcessed,
      created: created.length,
      updated: updated.length,
      existing: existing.length,
      failed: failed.length
    };

    return sendResponse(res, response);

  } catch (error) {
    console.error('Bulk upsert error:', { message: error.message });
    const resp = errorResponse('Internal server error', 500);
    return sendResponse(res, resp);
  }
};

module.exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      const response = errorResponse('Name, email, password, and role are required', 400);
      return sendResponse(res, response);
    }

    // Validate email format
    if (!isValidEmail(email)) {
      const response = errorResponse('Invalid email format', 400);
      return sendResponse(res, response);
    }

    // Validate role
    if (!isValidRole(role)) {
      const response = errorResponse('Invalid role. Must be one of: superuser, admin, supervisor, user', 400);
      return sendResponse(res, response);
    }

    // Restriction: Universal users can only create superusers
    if (req.user.role === 'universal_user' && role !== 'superuser') {
      const response = errorResponse('Universal users can only create Superuser accounts', 403);
      return sendResponse(res, response);
    }

    // Check if email is already in use
    const existingUser = await User.findOne({ 
      where: { email: email, deleted_at: null } 
    });
    
    if (existingUser) {
      const response = errorResponse('Email is already associated with an account', 409);
      return sendResponse(res, response);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user data
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      department: department || null,
      phone_no: phone || null,
      company_id: req.user.company_id
    };

    // Create new user
    const newUser = await User.create(userData);

    // Remove password from response
    const userResponse = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      department: newUser.department,
      phone: newUser.phone_no,
      company_id: newUser.company_id,
      createdAt: newUser.createdAt
    };

    const response = successResponse('User created successfully', userResponse, 201);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Error in createUser:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      const response = errorResponse('Email already exists', 409);
      return sendResponse(res, response);
    }

    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

module.exports.getAllUser = async (req, res) => {
  try {
    // Check if user has permission to view all users
    if (!req.user || !['admin', 'superuser'].includes(req.user.role)) {
      const response = errorResponse("Access denied. Admin privileges required to view all users.", 403);
      return sendResponse(res, response);
    }

    const result = await User.unscoped().findAll({
      attributes: ["id", "email", "name", "phone_no", "department", "profile_pic","role", "company_id","supervisor_id","createdAt","updatedAt"],
      include: [
        {
          model: models.company,
          as: 'company',
          attributes: ["id", "name"],
        },
      ],
      where: {
        deleted_at: null, 
        company_id: req.user.company_id 
      }
    });

    // Map the response to use consistent field names
    const mappedResult = result.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone_no, // Map phone_no to phone
      department: user.department,
      profile_pic: user.profile_pic,
      role: user.role,
      company_id: user.company_id,
      supervisor_id: user.supervisor_id,
      company: user.company,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    const response = successResponse('Users retrieved successfully', mappedResult);
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in getAllUser:", error);
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};

module.exports.getAllUserRestricted = async (req, res) => {
  try {
    const result = await User.scope('basic').findAll({
      where: {
        company_id: req.user.company_id,
        deleted_at: null
      }
    });

    const response = successResponse('Users retrieved successfully', result);
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in getAllUserRestricted:", error);
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};


module.exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { email, role, password, name, phone, department } = req.body;

    // Only superusers can update users
    if (req.user.role !== 'superuser') {
      const response = errorResponse("Access denied. Only superusers can update users.", 403);
      return sendResponse(res, response);
    }

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      const response = errorResponse('Invalid email format', 400);
      return sendResponse(res, response);
    }

    // Validate role if provided
    if (role && !isValidRole(role)) {
      const response = errorResponse('Invalid role. Must be one of: superuser, admin, supervisor, user', 400);
      return sendResponse(res, response);
    }

    // Find the user to update
    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id,
        deleted_at: null
      } 
    });

    if (!user) {
      const response = errorResponse("User not found or access denied", 404);
      return sendResponse(res, response);
    }

    // Prepare update data
    const updateData = {};
    
    // Update email if provided
    if (email && email !== user.email) {
      // Check if email is already in use
      const existingUser = await User.findOne({ 
        where: { 
          email: email,
          id: { [Op.ne]: userId },
          deleted_at: null
        } 
      });
      
      if (existingUser) {
        const response = errorResponse("Email is already in use by another user", 409);
        return sendResponse(res, response);
      }
      updateData.email = email;
    }

    // Update role if provided
    if (role && role !== user.role) {
      updateData.role = role;
    }

    // Update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update other fields
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone_no = phone;
    if (department !== undefined) updateData.department = department;

    // Update the user
    const updatedUser = await user.update(updateData);

    // Return updated user without password
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone: updatedUser.phone_no,
      department: updatedUser.department,
      role: updatedUser.role,
      company_id: updatedUser.company_id,
      updatedAt: updatedUser.updatedAt
    };

    const response = successResponse("User updated successfully", userResponse);
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in updateUser:", error);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      const response = errorResponse("Validation error", 400, validationErrors);
      return sendResponse(res, response);
    }
    
    // Handle unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      const response = errorResponse("Email already exists", 409);
      return sendResponse(res, response);
    }
    
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};

module.exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    // Validate user ID parameter
    if (!userId || isNaN(parseInt(userId))) {
      const response = errorResponse('Invalid user ID parameter', 400);
      return sendResponse(res, response);
    }

    const user = await User.findOne({
      where: { 
        id: userId,
        deleted_at: null
      },
      include: [
        {
          model: User,
          as: "supervisor",
          attributes: ["id", "name", "email", "role"]
        }
      ],
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      const response = errorResponse("User not found", 404);
      return sendResponse(res, response);
    }

    const response = successResponse('User retrieved successfully', user);
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in getUserById:", error);
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};

module.exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Validate user ID parameter
    if (!userId || isNaN(parseInt(userId))) {
      const response = errorResponse('Invalid user ID parameter', 400);
      return sendResponse(res, response);
    }

    // Only superusers can delete users
    if (req.user.role !== 'superuser') {
      const response = errorResponse("Access denied. Only superusers can delete users.", 403);
      return sendResponse(res, response);
    }

    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id,
        deleted_at: null
      } 
    });

    if (!user) {
      const response = errorResponse("User not found or access denied", 404);
      return sendResponse(res, response);
    }

    await user.destroy();
    
    const response = successResponse("User deleted successfully");
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in deleteUser:", error);
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};

module.exports.resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    // Validate user ID parameter
    if (!userId || isNaN(parseInt(userId))) {
      const response = errorResponse('Invalid user ID parameter', 400);
      return sendResponse(res, response);
    }

    // Only superusers can reset passwords
    if (req.user.role !== 'superuser') {
      const response = errorResponse("Access denied. Only superusers can reset passwords.", 403);
      return sendResponse(res, response);
    }

    if (!newPassword) {
      const response = errorResponse("New password is required", 400);
      return sendResponse(res, response);
    }

    // Find the user to update
    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id,
        deleted_at: null
      } 
    });

    if (!user) {
      const response = errorResponse("User not found or access denied", 404);
      return sendResponse(res, response);
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    await user.update({ password: hashedPassword });

    const response = successResponse("Password reset successfully");
    return sendResponse(res, response);

  } catch (error) {
    console.error("Error in resetUserPassword:", error);
    const response = errorResponse("Internal server error", 500);
    return sendResponse(res, response);
  }
};