const models = require('../models');
const Payment = models.payments;
const User = models.user;
const { v4: uuidv4 } = require('uuid');
const notificationController = require('./notificationController');
const stripeService = require('../services/stripeService');

// Create payment intent (for Stripe)
exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({
        status: false,
        message: 'Amount is required'
      });
    }

    const paymentIntent = await stripeService.createPaymentIntent(amount);

    return res.status(200).json({
      status: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error creating payment intent',
      error: error.message
    });
  }
};

// Process payment for a user (SuperAdmin only)
exports.processPayment = async (req, res) => {
  const t = await models.sequelize.transaction();
  
  try {
    const { userId, amount, paymentMethod, validityMonths = 1, stripePaymentIntentId } = req.body;

    // Validate input
    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({
        status: false,
        message: 'Missing required fields: userId, amount, paymentMethod'
      });
    }

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }

    // If payment method is stripe, verify the payment intent
    if (paymentMethod === 'stripe' && stripePaymentIntentId) {
      const paymentIntent = await stripeService.retrievePaymentIntent(stripePaymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          status: false,
          message: 'Payment has not been completed'
        });
      }
    }

    // Calculate validity period
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + validityMonths);

    // Create payment record
    const payment = await Payment.create({
      userId,
      amount,
      paymentMethod,
      validUntil,
      status: 'completed',
      transactionId: stripePaymentIntentId || uuidv4(),
      processedBy: req.user.id
    }, { transaction: t });

    // Create notification for successful payment
    await notificationController.createNotification(
      userId,
      'Payment Successful',
      `Your payment of $${amount} has been processed successfully. Valid until ${validUntil.toLocaleDateString()}.`,
      'payment'
    );

    await t.commit();

    return res.status(200).json({
      status: true,
      message: 'Payment processed successfully',
      data: payment
    });

  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      status: false,
      message: 'Error processing payment',
      error: error.message
    });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    
    const payments = await Payment.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'processor',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    console.log("Found payments:", payments.length);

    return res.status(200).json({
      status: true,
      data: payments
    });
  } catch (error) {
    console.error('Payment controller error:', error);
    return res.status(500).json({
      status: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
};

// Get user's payment history
exports.getUserPayments = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Users can only view their own payments unless they're admin
    if (req.user.user_type !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    const payments = await Payment.findAll({
      where: { userId },
      include: [
        {
          model: User,
          as: 'processor',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Check payment status and create notifications if needed
    await notificationController.checkPaymentStatusAndNotify();

    return res.status(200).json({
      status: true,
      data: payments
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching user payments',
      error: error.message
    });
  }
};

// Check user's payment status
exports.checkPaymentStatus = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Users can only check their own status unless they're admin
    if (req.user.user_type !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        status: false,
        message: 'Access denied'
      });
    }

    const latestPayment = await Payment.findOne({
      where: { 
        userId,
        status: 'completed'
      },
      order: [['validUntil', 'DESC']]
    });

    const hasActiveSubscription = latestPayment && new Date(latestPayment.validUntil) > new Date();

    return res.status(200).json({
      status: true,
      data: {
        hasActiveSubscription,
        latestPayment,
        validUntil: latestPayment ? latestPayment.validUntil : null
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
};

// Get all users' subscription status (SuperAdmin only)
exports.getAllUsersSubscriptionStatus = async (req, res) => {
  try {
    // Only SuperAdmin can access this endpoint
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role'],
      include: [{
        model: Payment,
        as: 'payments',
        attributes: ['validUntil', 'amount', 'status'],
        where: { status: 'completed' },
        order: [['validUntil', 'DESC']],
        limit: 1,
        required: false
      }]
    });

    const usersStatus = users.map(user => {
      const latestPayment = user.payments?.[0];
      const hasActiveSubscription = latestPayment && new Date(latestPayment.validUntil) > new Date();

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.user_type,
        subscriptionStatus: {
          hasActiveSubscription,
          validUntil: latestPayment?.validUntil || null,
          lastPaymentAmount: latestPayment?.amount || null
        }
      };
    });

    return res.status(200).json({
      status: true,
      data: usersStatus
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching users subscription status',
      error: error.message
    });
  }
};

// Add a new function to check all users' payment status
exports.checkAllUsersPaymentStatus = async (req, res) => {
  try {
    await notificationController.checkPaymentStatusAndNotify();
    
    return res.status(200).json({
      status: true,
      message: 'Payment status checked and notifications sent'
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
}; 