const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const LicenseController = require('../controllers/licenseController');

console.log('🔧 License routes file loaded');
console.log('🔧 LicenseController methods:', Object.keys(LicenseController));

// Create a new license pool (superuser only)
router.post('/pools', auth, LicenseController.createLicensePool);

// Get all license pools (superuser/admin only)
router.get('/pools', auth, LicenseController.getAllLicensePools);

// Get specific license pool
router.get('/pools/:id', auth, LicenseController.getLicensePoolById);

// Update license pool
router.put('/pools/:id', auth, LicenseController.updateLicensePool);

// Allocate license to user
router.post('/allocations', auth, LicenseController.allocateLicense);

// Get all license allocations
router.get('/allocations', auth, LicenseController.getAllAllocations);

// Revoke license allocation
router.delete('/allocations/:id', auth, LicenseController.revokeLicense);

// Get user license status
router.get('/users/:userId/status', auth, LicenseController.getUserLicenseStatus);

// Debug endpoint: Get all license allocations in the system (superuser only)
router.get('/debug/all-allocations', auth, LicenseController.getAllAllocationsDebug);

// Debug endpoint: Get all license pools and their status (superuser only)
router.get('/debug/all-pools', auth, LicenseController.getAllPoolsDebug);

module.exports = router; 