const models = require('../models');
const LicensePool = models.license_pools;
const LicenseAllocation = models.license_allocations;
const User = models.user;
const Company = models.company;
const notificationController = require('./notificationController');
const { Op } = require('sequelize');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const Stripe = require('stripe');

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// =================== LICENSE POOL MANAGEMENT ===================

// Create a new license pool (bulk purchase)
exports.createLicensePool = async (req, res) => {
  const t = await models.sequelize.transaction();
  
  try {
    const { 
      poolName, 
      totalLicenses, 
      licenseType, 
      validityPeriodMonths, 
      totalAmount, 
      pricePerLicense,
      poolExpiryDate,
      notes,
      companyId,
      stripePaymentIntentId 
    } = req.body;

    // Validate input
    if (!poolName || !totalLicenses || !licenseType || !validityPeriodMonths || !totalAmount || !pricePerLicense) {
      await t.rollback();
      const response = errorResponse('Missing required fields: poolName, totalLicenses, licenseType, validityPeriodMonths, totalAmount, pricePerLicense', 400);
      return sendResponse(res, response);
    }

    // Only superuser can create license pools
    if (req.user.role !== 'superuser') {
      await t.rollback();
      const response = errorResponse('Only superusers can create license pools', 403);
      return sendResponse(res, response);
    }

    // Verify Stripe payment if payment intent ID is provided
    let paymentId = null;
    if (stripePaymentIntentId) {
      try {
        // Check if this is a test payment
        if (stripePaymentIntentId.startsWith('pi_test_')) {
          paymentId = stripePaymentIntentId;
        } else if (stripe) {
          // Verify the payment intent with Stripe
          const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
          
          if (paymentIntent.status !== 'succeeded') {
            await t.rollback();
            const response = errorResponse('Payment has not been completed successfully', 400);
            return sendResponse(res, response);
          }

          // Verify the amount matches
          const expectedAmount = Math.round(totalAmount * 100); // Convert to cents
          if (paymentIntent.amount !== expectedAmount) {
            await t.rollback();
            const response = errorResponse('Payment amount does not match the expected amount', 400);
            return sendResponse(res, response);
          }

          paymentId = stripePaymentIntentId;
        } else {
          paymentId = stripePaymentIntentId;
        }
      } catch (paymentError) {
        await t.rollback();
        console.error('Payment verification failed:', paymentError);
        const response = errorResponse('Payment verification failed: ' + paymentError.message, 400);
        return sendResponse(res, response);
      }
    }

    // Create license pool
    const licensePool = await LicensePool.create({
      poolName,
      purchasedBy: req.user.id,
      totalLicenses,
      licenseType,
      validityPeriodMonths,
      totalAmount,
      pricePerLicense,
      poolExpiryDate: poolExpiryDate || null,
      notes,
      companyId: req.user.company_id, // Always use the authenticated user's company
      stripePaymentIntentId: paymentId // Store payment intent ID for reference
    }, { transaction: t });

    // Create notification for successful pool creation
    await notificationController.createNotification(
      req.user.id,
      'License Pool Created',
      `Successfully created license pool "${poolName}" with ${totalLicenses} licenses.`,
      'license'
    );

    await t.commit();

    const response = successResponse('License pool created successfully', licensePool, 201);
    return sendResponse(res, response);

  } catch (error) {
    await t.rollback();
    const response = errorResponse('Error creating license pool', 500);
    return sendResponse(res, response);
  }
};

// Get all license pools
exports.getAllLicensePools = async (req, res) => {
  try {
    const { status, licenseType, companyId } = req.query;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (licenseType) whereClause.licenseType = licenseType;
    if (companyId) whereClause.companyId = companyId;

    // All users can only see pools from their company
    whereClause.companyId = req.user.company_id;

    const licensePools = await LicensePool.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'purchaser',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        },
        {
          model: LicenseAllocation,
          as: 'allocations',
          attributes: ['id', 'userId', 'status', 'validUntil'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const response = successResponse('License pools retrieved successfully', licensePools);
    return sendResponse(res, response);

  } catch (error) {
    const response = errorResponse('Error fetching license pools', 500);
    return sendResponse(res, response);
  }
};

// Get single license pool by ID
exports.getLicensePoolById = async (req, res) => {
  try {
    const { poolId } = req.params;

    const licensePool = await LicensePool.findByPk(poolId, {
      include: [
        {
          model: User,
          as: 'purchaser',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        },
        {
          model: LicenseAllocation,
          as: 'allocations',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email']
            },
            {
              model: User,
              as: 'allocator',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ]
    });

    if (!licensePool) {
      const response = errorResponse('License pool not found', 404);
      return sendResponse(res, response);
    }

    // Check permissions - all users can only access their company's pools
    if (licensePool.companyId !== req.user.company_id) {
      const response = errorResponse('Access denied', 403);
      return sendResponse(res, response);
    }

    const response = successResponse('License pool retrieved successfully', licensePool);
    return sendResponse(res, response);

  } catch (error) {
    const response = errorResponse('Error fetching license pool', 500);
    return sendResponse(res, response);
  }
};

// Update license pool
exports.updateLicensePool = async (req, res) => {
  try {
    const { poolId } = req.params;
    const { poolName, notes, status, poolExpiryDate } = req.body;

    const licensePool = await LicensePool.findByPk(poolId);
    if (!licensePool) {
      const response = errorResponse('License pool not found', 404);
      return sendResponse(res, response);
    }

    // Only superuser or the purchaser can update
    if (req.user.role !== 'superuser' && licensePool.purchasedBy !== req.user.id) {
      const response = errorResponse('Access denied', 403);
      return sendResponse(res, response);
    }

    const updatedPool = await licensePool.update({
      poolName: poolName || licensePool.poolName,
      notes: notes !== undefined ? notes : licensePool.notes,
      status: status || licensePool.status,
      poolExpiryDate: poolExpiryDate !== undefined ? poolExpiryDate : licensePool.poolExpiryDate
    });

    const response = successResponse('License pool updated successfully', updatedPool);
    return sendResponse(res, response);

  } catch (error) {
    const response = errorResponse('Error updating license pool', 500);
    return sendResponse(res, response);
  }
};

// Delete license pool
exports.deleteLicensePool = async (req, res) => {
  try {
    const { poolId } = req.params;

    const licensePool = await LicensePool.findByPk(poolId);
    if (!licensePool) {
      const response = errorResponse('License pool not found', 404);
      return sendResponse(res, response);
    }

    // Only superuser can delete license pools
    if (req.user.role !== 'superuser') {
      const response = errorResponse('Access denied. Only superusers can delete license pools.', 403);
      return sendResponse(res, response);
    }

    // Delete the license pool
    await licensePool.destroy();

    const response = successResponse('License pool deleted successfully', null);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Error deleting license pool:', error);
    const response = errorResponse('Error deleting license pool', 500);
    return sendResponse(res, response);
  }
};

// =================== LICENSE ALLOCATION MANAGEMENT ===================

// Allocate license to a user
exports.allocateLicense = async (req, res) => {
  const t = await models.sequelize.transaction();
  
  try {
    const { 
      licensePoolId, 
      userId, 
      validFrom, 
      customValidityMonths, 
      features, 
      restrictions, 
      notes,
      autoRenew 
    } = req.body;

    // Validate input
    if (!licensePoolId || !userId) {
      await t.rollback();
      const response = errorResponse('Missing required fields: licensePoolId, userId', 400);
      return sendResponse(res, response);
    }

    // Only superuser or admin can allocate licenses
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      await t.rollback();
      const response = errorResponse('Only superusers and admins can allocate licenses', 403);
      return sendResponse(res, response);
    }


    const licensePool = await LicensePool.findByPk(licensePoolId);
    if (!licensePool) {
      await t.rollback();
      const response = errorResponse('License pool not found', 404);
      return sendResponse(res, response);
    }

    if (!licensePool.canAllocateLicense()) {
      await t.rollback();
      const response = errorResponse('No available licenses in this pool or pool is not active', 400);
      return sendResponse(res, response);
    }

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      await t.rollback();
      const response = errorResponse('User not found', 404);
      return sendResponse(res, response);
    }

    // Check if user already has any active license allocation from any pool
    const existingAllocation = await LicenseAllocation.findOne({
      where: { 
        userId
      },
      include: [
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName', 'licenseType']
        }
      ]
    });

    if (existingAllocation && (existingAllocation.status === 'active' || existingAllocation.status === 'allocated')){
      await t.rollback();
      const poolInfo = existingAllocation.licensePool 
        ? ` from pool "${existingAllocation.licensePool.poolName}" (${existingAllocation.licensePool.licenseType})`
        : '';
      const response = errorResponse(`User already has an active license${poolInfo}. Please revoke the existing license before allocating a new one.`, 409);
      return sendResponse(res, response);
    }

    // Calculate validity dates
    const startDate = validFrom ? new Date(validFrom) : new Date();
    const endDate = new Date(startDate);
    const validityMonths = customValidityMonths || licensePool.validityPeriodMonths;
    endDate.setMonth(endDate.getMonth() + validityMonths);

    if (existingAllocation) {
      await existingAllocation.destroy({ transaction: t });
    }

    // Create license allocation
    const allocation = await LicenseAllocation.create({
      licensePoolId,
      userId,
      allocatedBy: req.user.id,
      validFrom: startDate,
      validUntil: endDate,
      features: features || null,
      restrictions: restrictions || null,
      notes: notes || null,
      autoRenew: autoRenew || false,
      companyId: user.company_id,
      status: 'active'
    }, { transaction: t });

    // Update license pool allocated count
    try {
      await licensePool.increment('allocatedLicenses', { by: 1, transaction: t });
    } catch (poolUpdateError) {
      // Continue anyway - the allocation is more important than the count
    }

    await t.commit();

    const response = successResponse('License allocated successfully', allocation, 201);
    sendResponse(res, response);

    // Create notifications asynchronously (don't wait for them)
    setImmediate(async () => {
      try {
        if (notificationController && typeof notificationController.createNotification === 'function') {
          await notificationController.createNotification(
            userId,
            'License Allocated',
            `A new license has been allocated to you from pool "${licensePool.poolName}". Valid until ${endDate.toLocaleDateString()}.`,
            'license'
          );

          await notificationController.createNotification(
            req.user.id,
            'License Allocation Successful',
            `Successfully allocated license from pool "${licensePool.poolName}" to ${user.name} (${user.email}).`,
            'license'
          );
        }
      } catch (notificationError) {
        console.error('Notification creation failed:', notificationError.message);
      }
    });

  } catch (error) {
    console.error('License allocation failed:', error);
    
    try {
      await t.rollback();
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }
    
    const response = errorResponse('Error allocating license', 500);
    return sendResponse(res, response);
  }
};

// Get all license allocations
exports.getAllAllocations = async (req, res) => {
  try {
    const { status, userId, licensePoolId, expiringSoon } = req.query;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = userId;
    if (licensePoolId) whereClause.licensePoolId = licensePoolId;

    // Apply company-based filtering based on user role
    if (req.user.role === 'superuser' || req.user.role === 'admin') {
      // Superusers and admins can see all allocations for their company
      whereClause.companyId = req.user.company_id;
    } else {
      // Regular users can only see their own allocations
      whereClause.userId = req.user.id;
    }

    let allocations = await LicenseAllocation.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'allocator',
          attributes: ['id', 'name', 'email']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName', 'licenseType', 'status']
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter for expiring soon if requested
    if (expiringSoon === 'true') {
      allocations = allocations.filter(allocation => {
        const daysRemaining = allocation.getDaysRemaining();
        return daysRemaining > 0 && daysRemaining <= 7;
      });
    }

    const response = successResponse('License allocations retrieved successfully', allocations);
    return sendResponse(res, response);

  } catch (error) {
    console.error('Error fetching license allocations:', error);
    const response = errorResponse('Error fetching license allocations', 500);
    return sendResponse(res, response);
  }
};

// Get user's current license status
exports.getUserLicenseStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only check their own status unless they're admin
    if (req.user.role !== 'admin' && req.user.role !== 'superuser' && req.user.id !== parseInt(userId)) {
      const response = errorResponse('Access denied', 403);
      return sendResponse(res, response);
    }
    
    const allocations = await LicenseAllocation.findAll({
      where: { userId },
      include: [
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName', 'licenseType', 'status']
        }
      ],
      order: [['validUntil', 'DESC']]
    });


    const activeAllocations = allocations.filter(allocation => allocation.status === 'active' || allocation.status === 'allocated');
    const expiredAllocations = allocations.filter(allocation => allocation.status === 'revoked' || allocation.status === 'expired');

    const upcomingAllocations = allocations.filter(allocation => 
      allocation.status === 'allocated' && new Date() < new Date(allocation.validFrom)
    );

    const response = successResponse('User license status retrieved successfully', {
      hasActiveLicense: activeAllocations.length > 0,
      activeAllocations,
      expiredAllocations,
      upcomingAllocations,
      totalAllocations: allocations.length
    });
    return sendResponse(res, response);

  } catch (error) {
    console.error('Error fetching user license status:', error);
    const response = errorResponse('Error fetching user license status', 500);
    return sendResponse(res, response);
  }
};

// Revoke license allocation
exports.revokeLicense = async (req, res) => {
  const t = await models.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Only superuser or admin can revoke licenses
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      await t.rollback();
      const response = errorResponse('Only superusers and admins can revoke licenses', 403);
      return sendResponse(res, response);
    }

    const allocation = await LicenseAllocation.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName']
        }
      ]
    });

    if (!allocation) {
      console.log("❌ License allocation not found");
      return res.status(404).json({
        status: false,
        message: 'License allocation not found'
      });
    }

    if (allocation.status === 'revoked') {
      console.log("❌ License is already revoked");
      return res.status(400).json({
        status: false,
        message: 'License is already revoked'
      });
    }

    console.log("🔄 Revoking license...");
    
    // Revoke the license
    await allocation.revoke(req.user.id, reason);
    // Create notifications
    try {
      await notificationController.createNotification(
        allocation.userId,
        'License Revoked',
        `Your license from pool "${allocation.licensePool.poolName}" has been revoked. ${reason ? `Reason: ${reason}` : ''}`,
        'license'
      );
      console.log("✅ Notification created");
    } catch (notificationError) {
      console.log("⚠️ Notification creation failed:", notificationError.message);
    }

    await t.commit();

    // Reload the allocation to get updated data
    await allocation.reload();

    return res.status(200).json({
      status: true,
      message: 'License revoked successfully',
      data: allocation
    });

  } catch (error) {
    console.error("❌ Error in revokeLicense:", error);
    await t.rollback();
    return res.status(500).json({
      status: false,
      message: 'Error revoking license',
      error: error.message
    });
  }
};

// Extend license allocation
exports.extendLicense = async (req, res) => {
  try {
    const { allocationId } = req.params;
    const { additionalMonths } = req.body;

    if (!additionalMonths || additionalMonths <= 0) {
      return res.status(400).json({
        status: false,
        message: 'Invalid additional months value'
      });
    }

    // Only superuser or admin can extend licenses
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      return res.status(403).json({
        status: false,
        message: 'Only superusers and admins can extend licenses'
      });
    }

    const allocation = await LicenseAllocation.findByPk(allocationId, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName']
        }
      ]
    });

    if (!allocation) {
      return res.status(404).json({
        status: false,
        message: 'License allocation not found'
      });
    }

    if (allocation.status === 'revoked') {
      return res.status(400).json({
        status: false,
        message: 'Cannot extend a revoked license'
      });
    }

    // Extend the license
    const updatedAllocation = await allocation.extend(additionalMonths);

    // Create notification
    await notificationController.createNotification(
      allocation.userId,
      'License Extended',
      `Your license from pool "${allocation.licensePool.poolName}" has been extended by ${additionalMonths} months. New expiry date: ${updatedAllocation.validUntil.toLocaleDateString()}.`,
      'license'
    );

    return res.status(200).json({
      status: true,
      message: 'License extended successfully',
      data: updatedAllocation
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error extending license',
      error: error.message
    });
  }
};

// =================== ANALYTICS AND REPORTING ===================

// Get license analytics dashboard
exports.getLicenseAnalytics = async (req, res) => {
  try {
    // Only superuser and admin can view analytics
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    const { companyId } = req.query;
    const whereClause = {};
    // All users can only see analytics for their company
    whereClause.companyId = req.user.company_id;

    // Get license pools statistics
    const poolStats = await LicensePool.findAll({
      where: whereClause,
      attributes: [
        'status',
        [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count'],
        [models.sequelize.fn('SUM', models.sequelize.col('total_licenses')), 'totalLicenses'],
        [models.sequelize.fn('SUM', models.sequelize.col('allocated_licenses')), 'allocatedLicenses'],
        [models.sequelize.fn('SUM', models.sequelize.col('total_amount')), 'totalAmount']
      ],
      group: ['status'],
      raw: true
    });

    // Get allocation statistics
    const allocationStats = await LicenseAllocation.findAll({
      where: whereClause,
      attributes: [
        'status',
        [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get expiring licenses (next 30 days)
    const expiringLicenses = await LicenseAllocation.findAll({
      where: {
        status: 'active',
        validUntil: {
          [Op.between]: [new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
        },
        ...(companyId ? { companyId } : {})
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName']
        }
      ]
    });

    // Get recent activity
    const recentActivity = await LicenseAllocation.findAll({
      where: companyId ? { companyId } : {},
      limit: 10,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'allocator',
          attributes: ['id', 'name', 'email']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName']
        }
      ]
    });

    return res.status(200).json({
      status: true,
      data: {
        poolStatistics: poolStats,
        allocationStatistics: allocationStats,
        expiringLicenses,
        recentActivity
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching license analytics',
      error: error.message
    });
  }
};

// Debug function: Get ALL license allocations in the system
exports.getAllAllocationsDebug = async (req, res) => {
  try {
    // Only superuser can access this debug endpoint
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied - superuser only'
      });
    }
    
    const allocations = await LicenseAllocation.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'role']
        },
        {
          model: LicensePool,
          as: 'licensePool',
          attributes: ['id', 'poolName', 'licenseType', 'status']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      status: true,
      data: {
        totalAllocations: allocations.length,
        allocations: allocations
      }
    });

  } catch (error) {
    console.error("❌ Error in getAllAllocationsDebug:", error);
    return res.status(500).json({
      status: false,
      message: 'Error fetching all allocations',
      error: error.message
    });
  }
};

// Debug function: Get ALL license pools in the system
exports.getAllPoolsDebug = async (req, res) => {
  try {
    // Only superuser can access this debug endpoint
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied - superuser only'
      });
    }
    
    const pools = await LicensePool.findAll({
      include: [
        {
          model: User,
          as: 'purchaser',
          attributes: ['id', 'email', 'role']
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    return res.status(200).json({
      status: true,
      data: {
        totalPools: pools.length,
        pools: pools
      }
    });

  } catch (error) {
    console.error("❌ Error in getAllPoolsDebug:", error);
    return res.status(500).json({
      status: false,
      message: 'Error fetching all pools',
      error: error.message
    });
  }
};

 