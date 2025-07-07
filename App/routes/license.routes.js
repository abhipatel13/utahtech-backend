const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/superAdminAuth');
const { checkRole } = require('../middleware/auth');
const licenseController = require('../controllers/licenseController');


// Apply authentication middleware to all routes
router.use(auth);

// =================== LICENSE POOL ROUTES ===================

// Create a new license pool (bulk purchase) - SuperAdmin only
router.post('/pools', isSuperAdmin, licenseController.createLicensePool);

// Get all license pools - SuperAdmin, Admin can see their company's pools
router.get('/pools', checkRole(['superuser', 'admin']), licenseController.getAllLicensePools);

// Get single license pool by ID - SuperAdmin, Admin, or company members
router.get('/pools/:poolId', checkRole(['superuser', 'admin', 'supervisor']), licenseController.getLicensePoolById);

// Update license pool - SuperAdmin or pool owner
router.put('/pools/:poolId', checkRole(['superuser']), licenseController.updateLicensePool);

// =================== LICENSE ALLOCATION ROUTES ===================

// Allocate license to a user - SuperAdmin, Admin only
router.post('/allocations', checkRole(['superuser', 'admin']), licenseController.allocateLicense);

// Get all license allocations - Role-based filtering
router.get('/allocations', auth, licenseController.getAllAllocations);

// Get user's current license status - User can check own, Admin can check any
router.get('/users/:userId/status', auth, licenseController.getUserLicenseStatus);

// Revoke license allocation - SuperAdmin, Admin only
router.delete('/allocations/:allocationId', checkRole(['superuser', 'admin']), licenseController.revokeLicense);

// Extend license allocation - SuperAdmin, Admin only
router.put('/allocations/:allocationId/extend', checkRole(['superuser', 'admin']), licenseController.extendLicense);

// =================== BULK LICENSE PURCHASE ROUTES ===================

// TODO: Implement bulk license pricing and payment methods in licenseController
// Get bulk license pricing tiers - SuperAdmin only
// router.get('/bulk/pricing', isSuperAdmin, licenseController.getBulkLicensePricing);

// Calculate bulk license pricing - SuperAdmin only  
// router.get('/bulk/calculate', isSuperAdmin, licenseController.calculateBulkLicensePricing);

// Create payment intent for bulk license purchase - SuperAdmin only
// router.post('/bulk/payment-intent', isSuperAdmin, licenseController.createBulkLicensePaymentIntent);

// Update payment routes to include bulk license endpoints
router.post('/bulk/process', isSuperAdmin, async (req, res) => {
  try {
    const { 
      poolName, 
      licenseType, 
      quantity, 
      totalAmount, 
      pricePerLicense,
      validityPeriodMonths,
      poolExpiryDate,
      notes,
      companyId,
      stripePaymentIntentId 
    } = req.body;

    // First create the license pool
    const poolData = {
      poolName,
      totalLicenses: parseInt(quantity),
      licenseType,
      validityPeriodMonths,
      totalAmount,
      pricePerLicense,
      poolExpiryDate,
      notes,
      companyId,
      stripePaymentIntentId
    };

    // Call the license controller to create the pool
    req.body = poolData;
    await licenseController.createLicensePool(req, res);

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error processing bulk license purchase',
      error: error.message
    });
  }
});

// =================== ANALYTICS AND REPORTING ROUTES ===================

// Get license analytics dashboard - SuperAdmin, Admin only
router.get('/analytics', checkRole(['superuser', 'admin']), licenseController.getLicenseAnalytics);

// Get expiring licenses report - SuperAdmin, Admin only
router.get('/reports/expiring', checkRole(['superuser', 'admin']), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    req.query.expiringSoon = 'true';
    await licenseController.getAllAllocations(req, res);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching expiring licenses report',
      error: error.message
    });
  }
});

// Get license utilization report - SuperAdmin, Admin only
router.get('/reports/utilization', checkRole(['superuser', 'admin']), async (req, res) => {
  try {
    // This could be expanded to show detailed utilization metrics
    await licenseController.getAllLicensePools(req, res);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching utilization report',
      error: error.message
    });
  }
});

// =================== USER SELF-SERVICE ROUTES ===================

// Get current user's license status
router.get('/my-status', auth, async (req, res) => {
  try {
    req.params.userId = req.user.id;
    await licenseController.getUserLicenseStatus(req, res);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching user license status',
      error: error.message
    });
  }
});

// Get current user's license allocations
router.get('/my-licenses', auth, async (req, res) => {
  try {
    req.query.userId = req.user.id;
    await licenseController.getAllAllocations(req, res);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching user licenses',
      error: error.message
    });
  }
});

// Activate user's allocated license
router.post('/allocations/:allocationId/activate', auth, async (req, res) => {
  try {
    const { allocationId } = req.params;
    const models = require('../models');
    const LicenseAllocation = models.license_allocations;

    const allocation = await LicenseAllocation.findByPk(allocationId);
    if (!allocation) {
      return res.status(404).json({
        status: false,
        message: 'License allocation not found'
      });
    }

    // Users can only activate their own licenses
    if (allocation.userId !== req.user.id) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    if (!allocation.canActivate()) {
      return res.status(400).json({
        status: false,
        message: 'License cannot be activated at this time'
      });
    }

    await allocation.activate();

    return res.status(200).json({
      status: true,
      message: 'License activated successfully',
      data: allocation
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error activating license',
      error: error.message
    });
  }
});

// =================== ADMIN MANAGEMENT ROUTES ===================

// Bulk allocate licenses - SuperAdmin, Admin only
router.post('/bulk-allocate', checkRole(['superuser', 'admin']), async (req, res) => {
  try {
    const { licensePoolId, userIds, validFrom, customValidityMonths, features, restrictions } = req.body;

    if (!licensePoolId || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        status: false,
        message: 'Missing required fields: licensePoolId, userIds (array)'
      });
    }

    const results = [];
    const errors = [];

    for (const userId of userIds) {
      try {
        // Set up request for each user
        const allocationRequest = {
          body: {
            licensePoolId,
            userId,
            validFrom,
            customValidityMonths,
            features,
            restrictions,
            notes: `Bulk allocation by ${req.user.name}`
          },
          user: req.user
        };

        // Mock response object
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              if (code === 201) {
                results.push({ userId, success: true, data: data.data });
              } else {
                errors.push({ userId, error: data.message });
              }
              return mockRes;
            }
          })
        };

        await licenseController.allocateLicense(allocationRequest, mockRes);
      } catch (error) {
        errors.push({ userId, error: error.message });
      }
    }

    return res.status(200).json({
      status: true,
      message: `Bulk allocation completed. ${results.length} successful, ${errors.length} errors.`,
      data: {
        successful: results,
        errors: errors
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error performing bulk allocation',
      error: error.message
    });
  }
});

// Transfer license between users - SuperAdmin only
router.post('/allocations/:allocationId/transfer', isSuperAdmin, async (req, res) => {
  try {
    const { allocationId } = req.params;
    const { newUserId, reason } = req.body;

    if (!newUserId) {
      return res.status(400).json({
        status: false,
        message: 'Missing required field: newUserId'
      });
    }

    const models = require('../models');
    const LicenseAllocation = models.license_allocations;
    const User = models.user;

    const allocation = await LicenseAllocation.findByPk(allocationId, {
      include: [
        { model: models.license_pools, as: 'licensePool' },
        { model: User, as: 'user' }
      ]
    });

    if (!allocation) {
      return res.status(404).json({
        status: false,
        message: 'License allocation not found'
      });
    }

    const newUser = await User.findByPk(newUserId);
    if (!newUser) {
      return res.status(404).json({
        status: false,
        message: 'New user not found'
      });
    }

    // Check if new user already has an allocation from this pool
    const existingAllocation = await LicenseAllocation.findOne({
      where: { 
        licensePoolId: allocation.licensePoolId, 
        userId: newUserId,
        status: ['allocated', 'active'] 
      }
    });

    if (existingAllocation) {
      return res.status(409).json({
        status: false,
        message: 'New user already has an active license from this pool'
      });
    }

    const oldUserId = allocation.userId;
    
    // Update the allocation
    await allocation.update({
      userId: newUserId,
      notes: `${allocation.notes || ''}\n\nTransferred from User ID ${oldUserId} to User ID ${newUserId} by ${req.user.name}. Reason: ${reason || 'Not specified'}`
    });

    // Create notifications
    const notificationController = require('../controllers/notificationController');
    
    await notificationController.createNotification(
      newUserId,
      'License Transferred',
      `A license from pool "${allocation.licensePool.poolName}" has been transferred to you.`,
      'license'
    );

    await notificationController.createNotification(
      oldUserId,
      'License Transferred',
      `Your license from pool "${allocation.licensePool.poolName}" has been transferred to another user.`,
      'license'
    );

    return res.status(200).json({
      status: true,
      message: 'License transferred successfully',
      data: allocation
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error transferring license',
      error: error.message
    });
  }
});

module.exports = router; 