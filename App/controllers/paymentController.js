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

// =================== BULK LICENSE PURCHASE FUNCTIONS ===================

// Get bulk license pricing tiers
exports.getBulkLicensePricing = async (req, res) => {
  try {
    // Only superuser can access bulk pricing
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const pricingTiers = [
      {
        id: 'monthly_bulk',
        name: 'Monthly Bulk License',
        basePrice: 25.00,
        validityMonths: 1,
        minQuantity: 5,
        maxQuantity: 500,
        discountTiers: [
          { minQty: 5, maxQty: 24, discount: 0, pricePerLicense: 25.00 },
          { minQty: 25, maxQty: 49, discount: 10, pricePerLicense: 22.50 },
          { minQty: 50, maxQty: 99, discount: 15, pricePerLicense: 21.25 },
          { minQty: 100, maxQty: 199, discount: 20, pricePerLicense: 20.00 },
          { minQty: 200, maxQty: 500, discount: 25, pricePerLicense: 18.75 }
        ]
      },
      {
        id: 'quarterly_bulk',
        name: 'Quarterly Bulk License',
        basePrice: 65.00,
        validityMonths: 3,
        minQuantity: 5,
        maxQuantity: 500,
        discountTiers: [
          { minQty: 5, maxQty: 24, discount: 0, pricePerLicense: 65.00 },
          { minQty: 25, maxQty: 49, discount: 12, pricePerLicense: 57.20 },
          { minQty: 50, maxQty: 99, discount: 18, pricePerLicense: 53.30 },
          { minQty: 100, maxQty: 199, discount: 25, pricePerLicense: 48.75 },
          { minQty: 200, maxQty: 500, discount: 30, pricePerLicense: 45.50 }
        ]
      },
      {
        id: 'semi_annual_bulk',
        name: 'Semi-Annual Bulk License',
        basePrice: 120.00,
        validityMonths: 6,
        minQuantity: 5,
        maxQuantity: 500,
        discountTiers: [
          { minQty: 5, maxQty: 24, discount: 0, pricePerLicense: 120.00 },
          { minQty: 25, maxQty: 49, discount: 15, pricePerLicense: 102.00 },
          { minQty: 50, maxQty: 99, discount: 22, pricePerLicense: 93.60 },
          { minQty: 100, maxQty: 199, discount: 30, pricePerLicense: 84.00 },
          { minQty: 200, maxQty: 500, discount: 35, pricePerLicense: 78.00 }
        ]
      },
      {
        id: 'annual_bulk',
        name: 'Annual Bulk License',
        basePrice: 200.00,
        validityMonths: 12,
        minQuantity: 5,
        maxQuantity: 1000,
        discountTiers: [
          { minQty: 5, maxQty: 24, discount: 0, pricePerLicense: 200.00 },
          { minQty: 25, maxQty: 49, discount: 20, pricePerLicense: 160.00 },
          { minQty: 50, maxQty: 99, discount: 30, pricePerLicense: 140.00 },
          { minQty: 100, maxQty: 199, discount: 40, pricePerLicense: 120.00 },
          { minQty: 200, maxQty: 499, discount: 45, pricePerLicense: 110.00 },
          { minQty: 500, maxQty: 1000, discount: 50, pricePerLicense: 100.00 }
        ]
      }
    ];

    return res.status(200).json({
      status: true,
      data: pricingTiers
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error fetching bulk license pricing',
      error: error.message
    });
  }
};

// Calculate bulk license pricing
exports.calculateBulkLicensePricing = async (req, res) => {
  try {
    const { licenseType, quantity } = req.query;

    // Only superuser can calculate bulk pricing
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    if (!licenseType || !quantity) {
      return res.status(400).json({
        status: false,
        message: 'Missing required parameters: licenseType, quantity'
      });
    }

    const qty = parseInt(quantity);
    if (qty <= 0) {
      return res.status(400).json({
        status: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Get pricing tiers
    const pricingResponse = await exports.getBulkLicensePricing(req, res);
    if (!pricingResponse) return; // Error already handled

    // Mock the pricing calculation since we can't call the function directly
    let pricingTier = null;
    let pricePerLicense = 0;
    let discount = 0;
    let validityMonths = 0;

    switch (licenseType) {
      case 'monthly_bulk':
        validityMonths = 1;
        if (qty >= 5 && qty <= 24) { pricePerLicense = 25.00; discount = 0; }
        else if (qty >= 25 && qty <= 49) { pricePerLicense = 22.50; discount = 10; }
        else if (qty >= 50 && qty <= 99) { pricePerLicense = 21.25; discount = 15; }
        else if (qty >= 100 && qty <= 199) { pricePerLicense = 20.00; discount = 20; }
        else if (qty >= 200 && qty <= 500) { pricePerLicense = 18.75; discount = 25; }
        break;
      case 'quarterly_bulk':
        validityMonths = 3;
        if (qty >= 5 && qty <= 24) { pricePerLicense = 65.00; discount = 0; }
        else if (qty >= 25 && qty <= 49) { pricePerLicense = 57.20; discount = 12; }
        else if (qty >= 50 && qty <= 99) { pricePerLicense = 53.30; discount = 18; }
        else if (qty >= 100 && qty <= 199) { pricePerLicense = 48.75; discount = 25; }
        else if (qty >= 200 && qty <= 500) { pricePerLicense = 45.50; discount = 30; }
        break;
      case 'semi_annual_bulk':
        validityMonths = 6;
        if (qty >= 5 && qty <= 24) { pricePerLicense = 120.00; discount = 0; }
        else if (qty >= 25 && qty <= 49) { pricePerLicense = 102.00; discount = 15; }
        else if (qty >= 50 && qty <= 99) { pricePerLicense = 93.60; discount = 22; }
        else if (qty >= 100 && qty <= 199) { pricePerLicense = 84.00; discount = 30; }
        else if (qty >= 200 && qty <= 500) { pricePerLicense = 78.00; discount = 35; }
        break;
      case 'annual_bulk':
        validityMonths = 12;
        if (qty >= 5 && qty <= 24) { pricePerLicense = 200.00; discount = 0; }
        else if (qty >= 25 && qty <= 49) { pricePerLicense = 160.00; discount = 20; }
        else if (qty >= 50 && qty <= 99) { pricePerLicense = 140.00; discount = 30; }
        else if (qty >= 100 && qty <= 199) { pricePerLicense = 120.00; discount = 40; }
        else if (qty >= 200 && qty <= 499) { pricePerLicense = 110.00; discount = 45; }
        else if (qty >= 500 && qty <= 1000) { pricePerLicense = 100.00; discount = 50; }
        break;
      default:
        return res.status(400).json({
          status: false,
          message: 'Invalid license type'
        });
    }

    if (pricePerLicense === 0) {
      return res.status(400).json({
        status: false,
        message: 'Quantity out of range for this license type'
      });
    }

    const subtotal = qty * pricePerLicense;
    const discountAmount = subtotal * (discount / 100);
    const totalAmount = subtotal - discountAmount;

    const calculation = {
      licenseType,
      quantity: qty,
      validityMonths,
      pricePerLicense,
      subtotal,
      discount,
      discountAmount,
      totalAmount,
      savings: discountAmount,
      costPerLicensePerMonth: totalAmount / (qty * validityMonths)
    };

    return res.status(200).json({
      status: true,
      data: calculation
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error calculating bulk license pricing',
      error: error.message
    });
  }
};

// Create payment intent for bulk license purchase
exports.createBulkLicensePaymentIntent = async (req, res) => {
  try {
    const { licenseType, quantity, poolName, companyId } = req.body;

    // Only superuser can create bulk license payments
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    if (!licenseType || !quantity || !poolName) {
      return res.status(400).json({
        status: false,
        message: 'Missing required fields: licenseType, quantity, poolName'
      });
    }

    // Calculate pricing using mock calculation (in real implementation, call the actual function)
    const qty = parseInt(quantity);
    let pricePerLicense = 0;
    let validityMonths = 0;

    switch (licenseType) {
      case 'monthly_bulk':
        validityMonths = 1;
        if (qty >= 5 && qty <= 24) pricePerLicense = 25.00;
        else if (qty >= 25 && qty <= 49) pricePerLicense = 22.50;
        else if (qty >= 50 && qty <= 99) pricePerLicense = 21.25;
        else if (qty >= 100 && qty <= 199) pricePerLicense = 20.00;
        else if (qty >= 200 && qty <= 500) pricePerLicense = 18.75;
        break;
      case 'quarterly_bulk':
        validityMonths = 3;
        if (qty >= 5 && qty <= 24) pricePerLicense = 65.00;
        else if (qty >= 25 && qty <= 49) pricePerLicense = 57.20;
        else if (qty >= 50 && qty <= 99) pricePerLicense = 53.30;
        else if (qty >= 100 && qty <= 199) pricePerLicense = 48.75;
        else if (qty >= 200 && qty <= 500) pricePerLicense = 45.50;
        break;
      case 'semi_annual_bulk':
        validityMonths = 6;
        if (qty >= 5 && qty <= 24) pricePerLicense = 120.00;
        else if (qty >= 25 && qty <= 49) pricePerLicense = 102.00;
        else if (qty >= 50 && qty <= 99) pricePerLicense = 93.60;
        else if (qty >= 100 && qty <= 199) pricePerLicense = 84.00;
        else if (qty >= 200 && qty <= 500) pricePerLicense = 78.00;
        break;
      case 'annual_bulk':
        validityMonths = 12;
        if (qty >= 5 && qty <= 24) pricePerLicense = 200.00;
        else if (qty >= 25 && qty <= 49) pricePerLicense = 160.00;
        else if (qty >= 50 && qty <= 99) pricePerLicense = 140.00;
        else if (qty >= 100 && qty <= 199) pricePerLicense = 120.00;
        else if (qty >= 200 && qty <= 499) pricePerLicense = 110.00;
        else if (qty >= 500 && qty <= 1000) pricePerLicense = 100.00;
        break;
    }

    if (pricePerLicense === 0) {
      return res.status(400).json({
        status: false,
        message: 'Invalid quantity or license type'
      });
    }

    const totalAmount = qty * pricePerLicense;

    const paymentIntent = await stripeService.createPaymentIntent(totalAmount);

    return res.status(200).json({
      status: true,
      clientSecret: paymentIntent.client_secret,
      calculation: {
        licenseType,
        quantity: qty,
        validityMonths,
        pricePerLicense,
        totalAmount,
        poolName
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error creating bulk license payment intent',
      error: error.message
    });
  }
}; 