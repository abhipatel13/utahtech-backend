const models = require('../models');
const LicensePool = models.license_pools;
const LicenseAllocation = models.license_allocations;
const User = models.user;
const Company = models.company;
const { v4: uuidv4 } = require('uuid');
const notificationController = require('./notificationController');
const { Op } = require('sequelize');

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
      return res.status(400).json({
        status: false,
        message: 'Missing required fields: poolName, totalLicenses, licenseType, validityPeriodMonths, totalAmount, pricePerLicense'
      });
    }

    // Only superuser can create license pools
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Only superusers can create license pools'
      });
    }

    // TODO: Implement payment verification when payment system is ready
    let paymentId = null;

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
      companyId: companyId || null,
      paymentId
    }, { transaction: t });

    // Create notification for successful pool creation
    await notificationController.createNotification(
      req.user.id,
      'License Pool Created',
      `Successfully created license pool "${poolName}" with ${totalLicenses} licenses.`,
      'license'
    );

    await t.commit();

    return res.status(201).json({
      status: true,
      message: 'License pool created successfully',
      data: licensePool
    });

  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      status: false,
      message: 'Error creating license pool',
      error: error.message
    });
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

    // For non-superusers, only show pools from their company
    if (req.user.role !== 'superuser') {
      whereClause.companyId = req.user.companyId;
    }

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

    return res.status(200).json({
      status: true,
      data: licensePools
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching license pools',
      error: error.message
    });
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
      return res.status(404).json({
        status: false,
        message: 'License pool not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'superuser' && req.user.role !== 'admin' && licensePool.companyId !== req.user.companyId) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    return res.status(200).json({
      status: true,
      data: licensePool
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching license pool',
      error: error.message
    });
  }
};

// Update license pool
exports.updateLicensePool = async (req, res) => {
  try {
    const { poolId } = req.params;
    const { poolName, notes, status, poolExpiryDate } = req.body;

    const licensePool = await LicensePool.findByPk(poolId);
    if (!licensePool) {
      return res.status(404).json({
        status: false,
        message: 'License pool not found'
      });
    }

    // Only superuser or the purchaser can update
    if (req.user.role !== 'superuser' && licensePool.purchasedBy !== req.user.id) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    const updatedPool = await licensePool.update({
      poolName: poolName || licensePool.poolName,
      notes: notes !== undefined ? notes : licensePool.notes,
      status: status || licensePool.status,
      poolExpiryDate: poolExpiryDate !== undefined ? poolExpiryDate : licensePool.poolExpiryDate
    });

    return res.status(200).json({
      status: true,
      message: 'License pool updated successfully',
      data: updatedPool
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error updating license pool',
      error: error.message
    });
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
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        status: false,
        message: 'Missing required fields: licensePoolId, userId'
      });
    }

    // Only superuser or admin can allocate licenses
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      console.log('❌ Access denied: User role is', req.user.role);
      return res.status(403).json({
        status: false,
        message: 'Only superusers and admins can allocate licenses'
      });
    }


    const licensePool = await LicensePool.findByPk(licensePoolId);
    if (!licensePool) {
      console.log('❌ License pool not found');
      return res.status(404).json({
        status: false,
        message: 'License pool not found'
      });
    }

    if (!licensePool.canAllocateLicense()) {
      console.log('❌ Cannot allocate license from pool:', { 
        status: licensePool.status, 
        available: licensePool.availableLicenses 
      });
      return res.status(400).json({
        status: false,
        message: 'No available licenses in this pool or pool is not active'
      });
    }

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }

    // Check if user already has an allocation from this pool
    const existingAllocation = await LicenseAllocation.findOne({
      where: { 
        licensePoolId, 
        userId,
        status: ['allocated', 'active'] 
      }
    });

    if (existingAllocation) {
      console.log('❌ User already has active license from this pool');
      await t.rollback();
      return res.status(409).json({
        status: false,
        message: 'User already has an active license from this pool'
      });
    }

    // Calculate validity dates
    const startDate = validFrom ? new Date(validFrom) : new Date();
    const endDate = new Date(startDate);
    const validityMonths = customValidityMonths || licensePool.validityPeriodMonths;
    endDate.setMonth(endDate.getMonth() + validityMonths);

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
      companyId: user.companyId
    }, { transaction: t });

    // Update license pool allocated count
    try {
      await licensePool.increment('allocatedLicenses', { by: 1, transaction: t });
    } catch (poolUpdateError) {
      // Continue anyway - the allocation is more important than the count
    }

    console.log('💾 Committing transaction...');
    await t.commit();
    console.log('✅ Transaction committed successfully');

    const response = {
      status: true,
      message: 'License allocated successfully',
      data: allocation
    };

    console.log('🎉 License allocation completed successfully!');
    res.status(201).json(response);

    // Create notifications asynchronously (don't wait for them)
    console.log('📧 Creating notifications asynchronously...');
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
          console.log('✅ Notifications created successfully');
        } else {
          console.log('⚠️ Notification controller not available, skipping notifications');
        }
      } catch (notificationError) {
        console.log('⚠️ Notification creation failed:', notificationError.message);
      }
    });

  } catch (error) {
    console.error('💥 License allocation failed:', error);
    console.error('📋 Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    try {
      await t.rollback();
      console.log('🔄 Transaction rolled back');
    } catch (rollbackError) {
      console.error('💥 Rollback failed:', rollbackError);
    }
    
    return res.status(500).json({
      status: false,
      message: 'Error allocating license',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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

    // For non-superusers, only show allocations from their company
    if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
      whereClause.userId = req.user.id; // Regular users can only see their own allocations
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

    return res.status(200).json({
      status: true,
      data: allocations
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching license allocations',
      error: error.message
    });
  }
};

// Get user's current license status
exports.getUserLicenseStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only check their own status unless they're admin
    if (req.user.role !== 'admin' && req.user.role !== 'superuser' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
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


    const activeAllocations = allocations.filter(allocation => allocation.status === 'allocated');
    const expiredAllocations = allocations.filter(allocation => allocation.status === 'revoked');

    const upcomingAllocations = allocations.filter(allocation => 
      allocation.status === 'allocated' && new Date() < new Date(allocation.validFrom)
    );

    return res.status(200).json({
      status: true,
      data: {
        hasActiveLicense: activeAllocations.length > 0,
        activeAllocations,
        expiredAllocations,
        upcomingAllocations,
        totalAllocations: allocations.length
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching user license status',
      error: error.message
    });
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
      console.log("❌ Access denied - insufficient permissions");
      return res.status(403).json({
        status: false,
        message: 'Only superusers and admins can revoke licenses'
      });
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
    if (companyId) whereClause.companyId = companyId;
    if (req.user.role !== 'superuser') whereClause.companyId = req.user.companyId;

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
      where: companyId ? { companyId } : {},
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

 