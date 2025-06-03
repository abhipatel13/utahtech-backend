const models = require('../models');
const Payment = models.payments;
const User = models.users;
const { v4: uuidv4 } = require('uuid');

// Process payment for a user (SuperAdmin only)
exports.processPayment = async (req, res) => {
  const t = await models.sequelize.transaction();
  
  try {
    const { userId, amount, paymentMethod, validityMonths = 1 } = req.body;

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
      transactionId: uuidv4(),
      processedBy: req.user.id
    }, { transaction: t });

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

// Get all payments (SuperAdmin only)
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

    return res.status(200).json({
      status: true,
      data: payments
    });
  } catch (error) {
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