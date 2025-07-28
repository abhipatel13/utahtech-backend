const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');
const { 
  validateIdParam,
  sanitizeInputs
} = require('../middleware/validation');

// Apply middleware to all routes
router.use(auth);
router.use(ensureCompanyAccess('notifications'));

// Get user's notifications
router.get('/my-notifications', 
  notificationController.getUserNotifications
);

// Get unread notification count
router.get('/unread-count',
  notificationController.getUnreadCount
);

// Mark notification as read
router.put('/:notificationId/mark-read', 
  validateIdParam('notificationId'),
  notificationController.markAsRead
);

// Mark all notifications as read
router.put('/mark-all-read', 
  notificationController.markAllAsRead
);

// Delete notification
router.delete('/:notificationId', 
  validateIdParam('notificationId'),
  notificationController.deleteNotification
);

module.exports = router; 