const models = require('../models');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { sanitizeInput } = require('../helper/validationHelper');
const { sendMail } = require('../helper/mail.helper');

const Notification = models.notifications;
const User = models.user;

// Base URL for frontend links in emails
const FRONTEND_BASE_URL = 'http://localhost:3001';
// const FRONTEND_BASE_URL = 'https://utah-tech.vercel.app';

// URL mapping for notification types
const NOTIFICATION_TYPE_PATHS = {
  approval: '/safety/supervisor-dashboard',
  hazard: '/safety/task-hazard',
  risk: '/safety/risk-assessment',
  license: '/notifications',
  payment: '/notifications',
  system: '/notifications',
  other: '/notifications'
};

/**
 * Get the frontend URL path for a notification type
 * @param {string} type - Notification type
 * @returns {string} Full URL to the relevant page
 */
const getNotificationUrl = (type) => {
  const path = NOTIFICATION_TYPE_PATHS[type] || '/notifications';
  return `${FRONTEND_BASE_URL}${path}`;
};

/**
 * Generate default HTML email template
 * @param {string} title - Email title/heading
 * @param {string} message - Email message body
 * @param {string} type - Notification type (for link generation)
 * @returns {string} HTML email content
 */
const generateDefaultEmailHtml = (title, message, type) => {
  const url = getNotificationUrl(type);
  return `
    <html lang="en">
      <body>
        <h2>${title}</h2>
        <p>${message}</p>
        <p style="margin-top: 20px;">
          <a href="${url}" style="color: #007bff; text-decoration: underline;">
            View in UTS Tool
          </a>
        </p>
      </body>
    </html>
  `;
};

/**
 * Create notification (internal helper function)
 * @param {number} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type
 * @param {Object} transaction - Optional Sequelize transaction
 * @returns {Promise<object>} Created notification
 */
exports.createNotification = async (userId, title, message, type = 'system', transaction = null) => {
  try {
    const options = transaction ? { transaction } : {};
    return await Notification.create({
      userId: userId,
      title: sanitizeInput(title),
      message: sanitizeInput(message),
      type
    }, options);
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create notification and send email to user
 * Creates an in-app notification and sends an email with the same content.
 * Email sending is fire-and-forget - failures are logged but don't block notification creation.
 * 
 * @param {Object} params - Parameters object
 * @param {number} params.userId - User ID (required) - used to fetch email from DB
 * @param {string} params.title - Notification title AND email subject (required)
 * @param {string} params.message - Notification message AND email text (required)
 * @param {string} params.type - Notification type (required) - 'approval' | 'risk' | 'hazard' | 'license' | 'payment' | 'system' | 'other'
 * @param {string} params.html - Custom HTML email template (optional) - uses default template if not provided
 * @param {Object} params.transaction - Sequelize transaction (optional)
 * @returns {Promise<object>} Created notification
 */
exports.createNotificationWithEmail = async ({ userId, title, message, type, html = null, transaction = null }) => {
  // Create the notification first
  const notification = await exports.createNotification(userId, title, message, type, transaction);

  // Fetch user email and send email (fire-and-forget)
  try {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'name'],
      ...(transaction ? { transaction } : {})
    });

    if (user && user.email) {
      const emailHtml = html || generateDefaultEmailHtml(title, message, type);
      console.log('emailHtml', emailHtml);
      sendMail(user.email, title, message, emailHtml);
    } else {
      console.warn(`Cannot send email notification: User ${userId} not found or has no email`);
    }
  } catch (emailError) {
    // Log email error but don't fail the notification creation
    console.error('Error sending notification email:', emailError);
  }

  return notification;
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