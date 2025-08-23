const db = require('../models');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper function to get user's company ID with validation
 */
const getUserCompanyId = (req) => {
  const userCompanyId = req.user?.company?.id;
  if (!userCompanyId) {
    throw new Error("User's company information is missing");
  }
  return userCompanyId;
};

/**
 * Create a new Tactic
 */
exports.create = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    const { analysis_name, location, status, ...assetDetails } = req.body;
    
    // Create the tactic with all fields
    const tactic = await db.tactics.create({
      id: uuidv4(),
      company_id: userCompanyId,
      analysisName: analysis_name, // Map from route field name to model field name
      location,
      status,
      assetDetails
    });
    
    sendResponse(res, successResponse(
      'Tactic created successfully',
      tactic,
      201
    ));

  } catch (error) {
    console.error('Error creating tactic:', error);
    sendResponse(res, errorResponse(
      error.message || 'Some error occurred while creating the Tactic.',
      500
    ));
  }
};

/**
 * Retrieve all Tactics for the authenticated user's company
 */
exports.findAll = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    const tactics = await db.tactics.findAll({
      where: {
        company_id: userCompanyId
      }
    });
    
    sendResponse(res, successResponse(
      'Tactics retrieved successfully',
      tactics
    ));

  } catch (error) {
    console.error('Error fetching tactics:', error);
    sendResponse(res, errorResponse(
      error.message || 'Some error occurred while retrieving tactics.',
      500
    ));
  }
};

/**
 * Retrieve all Tactics from all companies (Universal User Access)
 * Bypasses company access restrictions for universal users
 */
exports.findAllUniversal = async (req, res) => {
  try {
    // Check if user is a universal user
    if (req.user.role !== 'universal_user') {
      return sendResponse(res, errorResponse(
        'Access denied. Only universal users can access all tactics.',
        403
      ));
    }
    
    // Fetch tactics from all companies
    const tactics = await db.tactics.findAll({
      // No company filter - get all tactics
    });
    
    sendResponse(res, successResponse(
      'All Tactics retrieved successfully for universal user',
      tactics
    ));
    
  } catch (error) {
    console.error('Error retrieving all tactics:', error);
    sendResponse(res, errorResponse(
      error.message || 'Some error occurred while retrieving all tactics.',
      500
    ));
  }
};

/**
 * Retrieve a single Tactic with id
 */
exports.findOne = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    const tactic = await db.tactics.findOne({
      where: {
        id: req.params.id,
        company_id: userCompanyId
      }
    });
    
    if (!tactic) {
      return sendResponse(res, errorResponse('Tactic not found', 404));
    }
    
    sendResponse(res, successResponse(
      'Tactic retrieved successfully',
      tactic
    ));

  } catch (error) {
    console.error('Error retrieving tactic:', error);
    sendResponse(res, errorResponse(
      error.message || `Error retrieving Tactic with id ${req.params.id}`,
      500
    ));
  }
};

/**
 * Update a Tactic with id
 */
exports.update = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    // Map field names if analysis_name is provided
    const updateData = { ...req.body };
    if (updateData.analysis_name) {
      updateData.analysisName = updateData.analysis_name;
      delete updateData.analysis_name;
    }

    const [updated] = await db.tactics.update(updateData, {
      where: {
        id: req.params.id,
        company_id: userCompanyId
      },
      returning: true
    });
    
    if (!updated) {
      return sendResponse(res, errorResponse('Tactic not found', 404));
    }
    
    // Fetch the updated tactic
    const tactic = await db.tactics.findOne({
      where: { 
        id: req.params.id,
        company_id: userCompanyId
      }
    });
    
    sendResponse(res, successResponse(
      'Tactic updated successfully',
      tactic
    ));

  } catch (error) {
    console.error('Error updating tactic:', error);
    sendResponse(res, errorResponse(
      error.message || 'Some error occurred while updating the Tactic.',
      500
    ));
  }
};

/**
 * Delete a Tactic with id
 */
exports.delete = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getUserCompanyId(req);

    const deleted = await db.tactics.destroy({
      where: {
        id: req.params.id,
        company_id: userCompanyId
      }
    });
    
    if (!deleted) {
      return sendResponse(res, errorResponse('Tactic not found', 404));
    }
    
    sendResponse(res, successResponse('Tactic deleted successfully'));

  } catch (error) {
    console.error('Error deleting tactic:', error);
    sendResponse(res, errorResponse(
      error.message || 'Some error occurred while deleting the Tactic.',
      500
    ));
  }
}; 