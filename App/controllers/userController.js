const models = require("../models");
const User = models.user;
const { Op } = require('sequelize');
const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { isValidEmail, isValidRole } = require('../helper/validationHelper');
const { sendMail } = require('../helper/mail.helper.js');
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
  console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++")
  console.log(existing.name, incoming.name);
  console.log(existing.role, incoming.role);
  console.log(existing.department, incoming.department);
  console.log(existing.phone_no, incoming.phone);
  console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++")
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
        rowErrors.push('Invalid email format');
      }
      if (!row.role || typeof row.role !== 'string' || !IMPORT_ALLOWED_ROLES.includes(row.role)) {
        rowErrors.push('Invalid role');
      }
      // if (row.company_id === undefined || row.company_id === null || isNaN(parseInt(row.company_id))) {
      //   rowErrors.push('INVALID_COMPANY_ID');
      // }
      // Duplicate-in-request detection
      const sig = `${row.email}`;
      if (keySeen.has(sig)) {
        rowErrors.push('Duplicate in request');
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
      const resp = errorResponse('No valid users to process', 422, { failed }, 'All rows invalid');
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
      const resp = errorResponse('Invalid company ID', 400, { company_id: targetCompanyId }, 'Company not found');
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

    const updateUser = async (foundUser, row, existing, updated) => {
      const needsUpdate = hasTrackedChanges(foundUser, row);
      if (!needsUpdate) {
        existing.push({ email: row.email, id: foundUser.id, index: row.index });
        return;
      }

      const updatePayload = {};
      if ((row.name ?? '') !== (foundUser.name ?? '')) updatePayload.name = row.name || null;
      if ((row.role ?? '') !== (foundUser.role ?? '')) updatePayload.role = row.role;
      if ((row.department ?? '') !== (foundUser.department ?? '')) updatePayload.department = row.department || null;
      if ((row.phone ?? '') !== (foundUser.phone_no ?? '')) updatePayload.phone_no = row.phone || null;

      const updatedUser = await foundUser.update(updatePayload);
      updated.push({ email: row.email, id: updatedUser.id, index: row.index });
    }

    // Preload existing users by email (global uniqueness in current schema)
    const emailsAll = [...new Set(filtered.map(r => r.email))];
    const existingUsers = await User.unscoped().findAll({
      where: {
        email: { [Op.in]: emailsAll }
      },
      paranoid: false
    });
    const emailToUser = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]));

    const deletedUsers = await User.unscoped().findAll({
      where: {
        email: { [Op.in]: emailsAll },
        deleted_at: { [Op.ne]: null }
      },
      paranoid: false
    });

    const deletedEmailToUser = new Map(deletedUsers.map(u => [u.email.toLowerCase(), u]));

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

          // If user is deleted and belongs to the same company, restore and update
          if(deletedEmailToUser.has(row.email)){
            const deletedUser = deletedEmailToUser.get(row.email);
            if (parseInt(deletedUser.company_id) === parseInt(targetCompanyId)) {
              await deletedUser.restore();
              const reloadUser = await User.unscoped().findOne({
                where: {
                  email: row.email
                },
                paranoid: false
              });
              await updateUser(reloadUser, row, existing, updated);
              continue;
            }
            failed.push({ email: row.email, index: row.index, errors: ['Email in use at a different company'] });
            continue;
          }

          // If user belongs to a different company, do not reassign; fail this row
          if (parseInt(found.company_id) !== parseInt(targetCompanyId)) {
            failed.push({ email: row.email, index: row.index, errors: ['Email in use at a different company'] });
            continue;
          }

          await updateUser(found, row, existing, updated);

        } catch (err) {
          // Classify as failed for this row
          const code = err.name === 'SequelizeUniqueConstraintError' ? 'Duplicate email in database' : 'Row processing error';
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

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user data
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      department: department || null,
      phone_no: phone || null,
      company_id: req.user.company_id,
      email_verified: false,
      email_verification_token: verificationToken
    };

    // Create new user
    const newUser = await User.create(userData);

    // Send verification email
    // Use BACKEND_URL for production (https://18.188.112.65.nip.io) or localhost for local development
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const verificationUrl = `${backendUrl}/api/auth/verify-email/${verificationToken}`;
    const subject = "Verify Your Email Address - UTS Tool";
    const text = `Welcome to UTS Tool! Please verify your email address by clicking on the following link: ${verificationUrl}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to UTS Tool!</h2>
        <p>Thank you for joining us. Please verify your email address to activate your account.</p>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Verify Email</a>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you did not create this account, please ignore this email.</p>
      </div>
    `;

    sendMail(email, subject, text, html);

    // Remove password from response
    const userResponse = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      department: newUser.department,
      phone: newUser.phone_no,
      company_id: newUser.company_id,
      email_verified: newUser.email_verified,
      createdAt: newUser.createdAt
    };

    const response = successResponse('User created successfully. Verification email sent.', userResponse, 201);
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

    // Map the response to use consistent field names
    const mappedResult = result.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      phone: user.phone_no, // Map phone_no to phone
    }));

    const response = successResponse('Users retrieved successfully', mappedResult);
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

    // Hard delete the user (force: true bypasses paranoid soft delete)
    // This permanently removes the user and frees up the email for re-use
    await user.destroy({ force: true });
    
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