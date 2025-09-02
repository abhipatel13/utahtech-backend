const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { 
  validateRequired, 
  requireRole, 
  validateIdParam,
  requireJsonBody,
  sanitizeInputs
} = require('../middleware/validation');
const LicenseController = require('../controllers/licenseController');

// Create a new license pool (superuser only)
router.post('/pools', 
  auth, 
  requireRole(['superuser']),
  requireJsonBody(),
  validateRequired(['poolName', 'totalLicenses', 'licenseType', 'validityPeriodMonths', 'totalAmount', 'pricePerLicense']),
  sanitizeInputs(['poolName', 'notes']),
  LicenseController.createLicensePool
);

// Get all license pools
router.get('/pools', auth, LicenseController.getAllLicensePools);

// Get specific license pool
router.get('/pools/:poolId', 
  auth, 
  validateIdParam('poolId'), 
  LicenseController.getLicensePoolById
);

// Update license pool
router.put('/pools/:poolId', 
  auth, 
  requireRole(['superuser', 'admin']),
  validateIdParam('poolId'),
  requireJsonBody(),
  sanitizeInputs(['poolName', 'notes']),
  LicenseController.updateLicensePool
);

// Delete license pool
router.delete('/pools/:poolId', 
  auth, 
  requireRole(['superuser']),
  validateIdParam('poolId'),
  LicenseController.deleteLicensePool
);

// Allocate license to user
router.post('/allocations', 
  auth, 
  requireRole(['superuser', 'admin']),
  requireJsonBody(),
  validateRequired(['licensePoolId', 'userId']),
  LicenseController.allocateLicense
);

// Get all license allocations
router.get('/allocations', auth, LicenseController.getAllAllocations);

// Revoke license allocation
router.delete('/allocations/:id', 
  auth, 
  requireRole(['superuser', 'admin']),
  validateIdParam('id'),
  LicenseController.revokeLicense
);

// Get user license status
router.get('/users/:userId/status', 
  auth, 
  validateIdParam('userId'), 
  LicenseController.getUserLicenseStatus
);

// Get license analytics
router.get('/analytics', 
  auth, 
  requireRole(['superuser', 'admin']), 
  LicenseController.getLicenseAnalytics
);

// Debug endpoint: Get all license allocations in the system (superuser only)
router.get('/debug/all-allocations', 
  auth, 
  requireRole(['superuser']), 
  LicenseController.getAllAllocationsDebug
);

// Debug endpoint: Get all license pools and their status (superuser only)
router.get('/debug/all-pools', 
  auth, 
  requireRole(['superuser']), 
  LicenseController.getAllPoolsDebug
);

module.exports = router; 