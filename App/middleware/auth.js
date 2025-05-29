const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    console.log('Request Headers:', req.headers);
    console.log('Authorization Header:', req.header('Authorization'));
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    console.log('Extracted Token:', token);
    
    if (!token) {
      console.log('Token is missing or undefined');
      return res.status(401).json({ 
        status: false,
        message: 'No token provided. Please include Authorization: Bearer <token> in headers',
        code: 'NO_TOKEN'
      });
    }

    try {
      console.log("Token being verified:", token);
      console.log("JWT_SECRET:", process.env.JWT_SECRET);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded token:", decoded);
      const user = await User.findById(decoded.userId);
      console.log("User found:", user ? user.id : 'No user found');
      
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
        console.log("Token expired error:", error);
        return res.status(401).json({ 
          status: false,
          message: 'Session expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        });
      }
      console.error('Token verification error:', error);
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

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        status: false,
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        status: false,
        message: 'Access denied: insufficient permissions' 
      });
    }

    next();
  };
};

const checkPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = req.user.getPermissions();
    
    // Superuser or Admin has all permissions
    if (req.user.role === 'superuser' || req.user.role === 'admin') {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    next();
  };
};

const authenticateToken = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);

    User.findById(decoded.userId)
      .then(user => {
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }
        req.user = user;
        next();
      })
      .catch(error => {
        console.error('Error finding user:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  auth,
  checkRole,
  authenticateToken,
  checkPermission,
};