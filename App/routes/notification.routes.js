const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/auth');

// Get user's notifications
router.get('/my-notifications', authMiddleware, notificationController.getUserNotifications);

// Mark notification as read
router.put('/:notificationId/mark-read', authMiddleware, notificationController.markAsRead);

module.exports = router; 