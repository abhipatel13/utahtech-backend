const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');

// Apply middleware to all routes
router.use(auth);
router.use(ensureCompanyAccess('notifications'));

// Get user's notifications
router.get('/my-notifications', notificationController.getUserNotifications);

// Mark notification as read
router.put('/:notificationId/mark-read', notificationController.markAsRead);

module.exports = router; 