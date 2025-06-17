const models = require('../models');
const Notification = models.notifications;
const User = models.users;
const Payment = models.payments;

// Create notification
exports.createNotification = async (userId, title, message, type = 'payment') => {
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
      where: { userId },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
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
        userId
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

// Check payment status and create notifications
exports.checkPaymentStatusAndNotify = async () => {
  try {
    const users = await User.findAll({
      include: [{
        model: Payment,
        as: 'payments',
        attributes: ['validUntil', 'status'],
        where: { status: 'completed' },
        order: [['validUntil', 'DESC']],
        limit: 1,
        required: false
      }]
    });

    for (const user of users) {
      const latestPayment = user.payments?.[0];
      const hasActiveSubscription = latestPayment && new Date(latestPayment.validUntil) > new Date();

      if (!hasActiveSubscription) {
        // Notify the user
        await exports.createNotification(
          user.id,
          'Payment Required',
          'Your subscription has expired. Please process the payment to continue using the services.',
          'payment'
        );

        // Notify admins and superadmins
        const admins = await User.findAll({
          where: {
            user_type: ['admin', 'superadmin']
          }
        });

        for (const admin of admins) {
          await exports.createNotification(
            admin.id,
            'User Payment Status',
            `User ${user.name} (${user.email}) has an expired subscription.`,
            'payment'
          );
        }
      }
    }
  } catch (error) {
    console.error('Error checking payment status and creating notifications:', error);
    throw error;
  }
}; 