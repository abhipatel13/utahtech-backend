const models = require("../models");
const User = models.user;
const { Op } = require('sequelize');
const bcrypt = require("bcryptjs");
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { isValidEmail, isValidRole } = require('../helper/validationHelper');

module.exports.createUser = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate required fields
    if (!email || !password || !role) {
      const response = errorResponse('Email, password, and role are required', 400);
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
      ...req.body,
      email,
      password: hashedPassword,
      role,
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
      attributes: ["id", "email", "name", "phone_no", "profile_pic","role", "company_id","supervisor_id","createdAt","updatedAt"],
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

    const response = successResponse('Users retrieved successfully', result);
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
    const { email, role, password, name, phone_no } = req.body;

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
    if (phone_no !== undefined) updateData.phone_no = phone_no;

    // Update the user
    const updatedUser = await user.update(updateData);

    // Return updated user without password
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone_no: updatedUser.phone_no,
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