const models = require("../models");
const User = models.user;
const Company = models.company;
const { Op } = require('sequelize');
const bcrypt = require("bcryptjs");
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { isValidEmail, isValidRole } = require('../helper/validationHelper');

// Universal User Management - Create users of any role across all companies
module.exports.createUserAnyCompany = async (req, res) => {
  try {
    const { email, password, role, company_id, name, department, business_unit, plant } = req.body;

    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can create users across companies.', 403);
      return sendResponse(res, response);
    }

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
      const response = errorResponse('Invalid role. Must be one of: universal_user, superuser, admin, supervisor, user', 400);
      return sendResponse(res, response);
    }

    // For non-universal users, company_id is required
    if (role !== 'universal_user' && !company_id) {
      const response = errorResponse('Company ID is required for non-universal users', 400);
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

    // Validate company exists if company_id is provided
    if (company_id) {
      const company = await Company.findByPk(company_id);
      if (!company) {
        const response = errorResponse('Invalid company ID', 400);
        return sendResponse(res, response);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user data
    const userData = {
      email,
      password: hashedPassword,
      role,
      company_id: role === 'universal_user' ? null : company_id,
      name,
      department,
      business_unit,
      plant
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
      department: newUser.department,
      business_unit: newUser.business_unit,
      plant: newUser.plant,
      createdAt: newUser.createdAt
    };

    const response = successResponse('User created successfully by universal user', userResponse, 201);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Universal user create error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Get all users across all companies (universal user only)
module.exports.getAllUsersAllCompanies = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can view all users.', 403);
      return sendResponse(res, response);
    }

    const { page = 1, limit = 50, role, company_id, search } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = { deleted_at: null };
    
    if (role) {
      whereClause.role = role;
    }
    
    if (company_id) {
      whereClause.company_id = company_id;
    }
    
    if (search) {
      whereClause[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Get users with company information
    const users = await User.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        }
      ],
      attributes: { exclude: ['password'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const response = successResponse('Users retrieved successfully', {
      users: users.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(users.count / limit),
        totalUsers: users.count,
        limit: parseInt(limit)
      }
    });

    return sendResponse(res, response);

  } catch (error) {
    console.error('Get all users error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Get all companies (universal user only)
module.exports.getAllCompanies = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can view all companies.', 403);
      return sendResponse(res, response);
    }

    const companies = await Company.findAll({
      where: { deleted_at: null },
      attributes: ['id', 'name', 'createdAt', 'updatedAt'],
      order: [['name', 'ASC']]
    });

    const response = successResponse('Companies retrieved successfully', companies);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Get all companies error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Create company (universal user only)
module.exports.createCompany = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can create companies.', 403);
      return sendResponse(res, response);
    }

    const { name, description } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      const response = errorResponse('Company name is required', 400);
      return sendResponse(res, response);
    }

    // Check if company name already exists
    const existingCompany = await Company.findOne({
      where: { 
        name: name.trim(),
        deleted_at: null 
      }
    });

    if (existingCompany) {
      const response = errorResponse('Company with this name already exists', 409);
      return sendResponse(res, response);
    }

    // Create new company
    const newCompany = await Company.create({
      name: name.trim(),
      description: description || null
    });

    const response = successResponse('Company created successfully', {
      id: newCompany.id,
      name: newCompany.name,
      description: newCompany.description,
      createdAt: newCompany.createdAt,
      updatedAt: newCompany.updatedAt
    }, 201);

    return sendResponse(res, response);

  } catch (error) {
    console.error('Create company error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Update company (universal user only)
module.exports.updateCompany = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can update companies.', 403);
      return sendResponse(res, response);
    }

    const { companyId } = req.params;
    const { name, description } = req.body;

    // Find company
    const company = await Company.findOne({
      where: { id: companyId, deleted_at: null }
    });

    if (!company) {
      const response = errorResponse('Company not found', 404);
      return sendResponse(res, response);
    }

    // Validate name if provided
    if (name && name.trim() === '') {
      const response = errorResponse('Company name cannot be empty', 400);
      return sendResponse(res, response);
    }

    // Check name uniqueness if changing name
    if (name && name.trim() !== company.name) {
      const existingCompany = await Company.findOne({
        where: { 
          name: name.trim(),
          deleted_at: null,
          id: { [Op.ne]: companyId }
        }
      });
      
      if (existingCompany) {
        const response = errorResponse('Company with this name already exists', 409);
        return sendResponse(res, response);
      }
    }

    // Update company
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description || null;

    await company.update(updateData);

    const response = successResponse('Company updated successfully', {
      id: company.id,
      name: company.name,
      description: company.description,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    });

    return sendResponse(res, response);

  } catch (error) {
    console.error('Update company error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Delete company (universal user only)
module.exports.deleteCompany = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can delete companies.', 403);
      return sendResponse(res, response);
    }

    const { companyId } = req.params;

    // Find company
    const company = await Company.findOne({
      where: { id: companyId, deleted_at: null }
    });

    if (!company) {
      const response = errorResponse('Company not found', 404);
      return sendResponse(res, response);
    }

    // Check if company has users
    const usersInCompany = await User.count({
      where: { company_id: companyId, deleted_at: null }
    });

    if (usersInCompany > 0) {
      const response = errorResponse(`Cannot delete company. It has ${usersInCompany} user(s) assigned to it.`, 400);
      return sendResponse(res, response);
    }

    // Soft delete the company
    await company.destroy();

    const response = successResponse('Company deleted successfully', null);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Delete company error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Update user across companies (universal user only)
module.exports.updateUserAnyCompany = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can update users across companies.', 403);
      return sendResponse(res, response);
    }

    const { userId } = req.params;
    const { email, role, company_id, name, department, business_unit, plant } = req.body;

    // Find user
    const user = await User.findOne({
      where: { id: userId, deleted_at: null }
    });

    if (!user) {
      const response = errorResponse('User not found', 404);
      return sendResponse(res, response);
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      const response = errorResponse('Invalid email format', 400);
      return sendResponse(res, response);
    }

    // Validate role if provided
    if (role && !isValidRole(role)) {
      const response = errorResponse('Invalid role. Must be one of: universal_user, superuser, admin, supervisor, user', 400);
      return sendResponse(res, response);
    }

    // Check email uniqueness if changing email
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        where: { 
          email: email, 
          deleted_at: null,
          id: { [Op.ne]: userId }
        }
      });
      
      if (existingUser) {
        const response = errorResponse('Email is already in use by another user', 409);
        return sendResponse(res, response);
      }
    }

    // Validate company exists if company_id is provided
    if (company_id) {
      const company = await Company.findByPk(company_id);
      if (!company) {
        const response = errorResponse('Invalid company ID', 400);
        return sendResponse(res, response);
      }
    }

    // Update user
    const updateData = {};
    if (email) updateData.email = email;
    if (role) {
      updateData.role = role;
      // Set company_id to null for universal_user role
      updateData.company_id = role === 'universal_user' ? null : (company_id || user.company_id);
    } else if (company_id !== undefined) {
      updateData.company_id = company_id;
    }
    if (name !== undefined) updateData.name = name;
    if (department !== undefined) updateData.department = department;
    if (business_unit !== undefined) updateData.business_unit = business_unit;
    if (plant !== undefined) updateData.plant = plant;

    await user.update(updateData);

    // Get updated user with company information
    const updatedUser = await User.findOne({
      where: { id: userId },
      include: [
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        }
      ],
      attributes: { exclude: ['password'] }
    });

    const response = successResponse('User updated successfully', updatedUser);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Update user error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
};

// Delete user (universal user only)
module.exports.deleteUserAnyCompany = async (req, res) => {
  try {
    // Only universal users can access this endpoint
    if (req.user.role !== 'universal_user') {
      const response = errorResponse('Access denied. Only universal users can delete users across companies.', 403);
      return sendResponse(res, response);
    }

    const { userId } = req.params;

    // Find user
    const user = await User.findOne({
      where: { id: userId, deleted_at: null }
    });

    if (!user) {
      const response = errorResponse('User not found', 404);
      return sendResponse(res, response);
    }

    // Prevent deletion of the current universal user
    if (user.id === req.user.id) {
      const response = errorResponse('Cannot delete your own account', 400);
      return sendResponse(res, response);
    }

    // Soft delete the user
    await user.destroy();

    const response = successResponse('User deleted successfully', null);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Delete user error:', error);
    const response = errorResponse('Internal server error', 500);
    return sendResponse(res, response);
  }
}; 