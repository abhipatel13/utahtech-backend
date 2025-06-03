const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/superAdminAuth');
const paymentController = require('../controllers/paymentController');

// Apply authentication middleware to all routes
router.use(auth);

// SuperAdmin only routes
router.post('/process', isSuperAdmin, paymentController.processPayment);
router.get('/all', isSuperAdmin, paymentController.getAllPayments);

// Routes accessible by both users and SuperAdmin
router.get('/user/:userId', paymentController.getUserPayments);
router.get('/status/:userId', paymentController.checkPaymentStatus);

module.exports = router; 