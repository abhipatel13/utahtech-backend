const models = require('../models');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { sanitizeInput } = require('../helper/validationHelper');

const Notification = models.notifications;
const User = models.user;

/**
 * Create notification (internal helper function)
 * @param {number} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type
 * @returns {Promise<object>} Created notification
 */
exports.createNotification = async (userId, title, message, type = 'system') => {
  try {
    return await Notification.create({
      userId: userId,
      title: sanitizeInput(title),
      message: sanitizeInput(message),
      type
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Get user's notifications
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get notifications with user details
    const notifications = await Notification.findAll({
      where: { user_id: userId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email'],
        required: false
      }],
      order: [['createdAt', 'DESC']]
    });

    // Format notifications to match API documentation
    const formattedNotifications = notifications.map(notification => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      user: notification.user || null
    }));

    const response = successResponse('Notifications retrieved successfully', formattedNotifications);
    sendResponse(res, response);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    const response = errorResponse('Error fetching notifications', 500);
    sendResponse(res, response);
  }
};

/**
 * Mark notification as read
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { 
        id: notificationId,
        user_id: userId
      }
    });

    if (!notification) {
      const response = errorResponse('Notification not found', 404);
      return sendResponse(res, response);
    }

    // Only update if not already read
    if (!notification.isRead) {
      await notification.update({ isRead: true });
    }

    const response = successResponse('Notification marked as read');
    sendResponse(res, response);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    const response = errorResponse('Error marking notification as read', 500);
    sendResponse(res, response);
  }
};

/**
 * Mark all notifications as read for user
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.update(
      { isRead: true },
      { 
        where: { 
          user_id: userId,
          isRead: false
        }
      }
    );

    const response = successResponse('All notifications marked as read');
    sendResponse(res, response);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    const response = errorResponse('Error marking all notifications as read', 500);
    sendResponse(res, response);
  }
};

/**
 * Delete notification
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { 
        id: notificationId,
        user_id: userId
      }
    });

    if (!notification) {
      const response = errorResponse('Notification not found', 404);
      return sendResponse(res, response);
    }

    await notification.destroy();

    const response = successResponse('Notification deleted successfully');
    sendResponse(res, response);
  } catch (error) {
    console.error('Error deleting notification:', error);
    const response = errorResponse('Error deleting notification', 500);
    sendResponse(res, response);
  }
};

/**
 * Get unread notification count for user
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.count({
      where: { 
        user_id: userId,
        isRead: false
      }
    });

    const response = successResponse('Unread count retrieved successfully', { count: unreadCount });
    sendResponse(res, response);
  } catch (error) {
    console.error('Error getting unread count:', error);
    const response = errorResponse('Error getting unread count', 500);
    sendResponse(res, response);
  }
}; 