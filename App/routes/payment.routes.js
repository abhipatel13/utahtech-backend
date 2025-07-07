const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/superAdminAuth');
const paymentController = require('../controllers/paymentController');

// Apply authentication middleware to all routes
router.use(auth);

// Create payment intent (for Stripe)
router.post('/create-payment-intent', auth, paymentController.createPaymentIntent);

// SuperAdmin only routes
router.post('/process', isSuperAdmin, paymentController.processPayment);
router.get('/all', isSuperAdmin, paymentController.getAllPayments);

// Route for getting all users' subscription status
router.get('/users/subscription-status', isSuperAdmin, paymentController.getAllUsersSubscriptionStatus);

// User routes
router.get('/user/:userId', auth, paymentController.getUserPayments);
router.get('/status/:userId', auth, paymentController.checkPaymentStatus);

// Bulk license purchase routes (SuperAdmin only)
router.get('/bulk/pricing', isSuperAdmin, paymentController.getBulkLicensePricing);
router.get('/bulk/calculate', isSuperAdmin, paymentController.calculateBulkLicensePricing);
router.post('/bulk/payment-intent', isSuperAdmin, paymentController.createBulkLicensePaymentIntent);

module.exports = router; 