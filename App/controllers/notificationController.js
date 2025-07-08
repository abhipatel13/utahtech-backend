const models = require('../models');
const Notification = models.notifications;
const User = models.user;

// Create notification
exports.createNotification = async (userId, title, message, type = 'system') => {
  try {
    return await Notification.create({
      userId,
      title,
      message,
      type
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Get user's notifications
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const notifications = await Notification.findAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      status: true,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// Mark notification as read
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
      return res.status(404).json({
        status: false,
        message: 'Notification not found'
      });
    }

    await notification.update({ isRead: true });

    return res.status(200).json({
      status: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

// TODO: Add license expiration checking functionality 