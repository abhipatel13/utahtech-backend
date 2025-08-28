const jwt = require('jsonwebtoken');
const models = require('../models');
const User = models.user;

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        status: false,
        message: 'No token provided. Please include Authorization: Bearer <token> in headers',
        code: 'NO_TOKEN'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({
        where: { id: decoded.userId }
      });

      if (!user) {
        return res.status(401).json({ 
          status: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          status: false,
          message: 'Session expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      status: false,
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      error: error.message
    });
  }
};

module.exports = {
  auth
};