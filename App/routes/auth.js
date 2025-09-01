const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { 
  validateRequired, 
  validateEmail, 
  requireRole, 
  requireJsonBody,
  sanitizeInputs
} = require('../middleware/validation');
const authController = require('../controllers/authController');

// Register new user (admin only)
router.post('/register', 
  auth, 
  requireRole(['superuser', 'admin']),
  requireJsonBody(),
  validateRequired(['email', 'password']),
  validateEmail('email'),
  sanitizeInputs(['email']),
  authController.register
);

// Login user
router.post('/login',
  requireJsonBody(),
  validateRequired(['email', 'password']),
  validateEmail('email'),
  sanitizeInputs(['email']),
  authController.login
);

// Logout user
router.post('/logout', auth, authController.logout);

// Get current user profile
router.get('/profile', auth, authController.getProfile);

// Update user profile
router.put('/profile', 
  auth,
  requireJsonBody(),
  sanitizeInputs(['email']),
  authController.updateProfile
);

// Forgot password
router.post('/forgot-password',
  requireJsonBody(),
  validateRequired(['email']),
  validateEmail('email'),
  sanitizeInputs(['email']),
  authController.forgotPassword
);

// Reset password
router.post('/reset-password',
  requireJsonBody(),
  validateRequired(['token', 'newPassword']),
  authController.resetPassword
);

// Find user by email and company
router.post('/find-user',
  requireJsonBody(),
  validateRequired(['email', 'company']),
  validateEmail('email'),
  sanitizeInputs(['email', 'company']),
  authController.findUserByEmailAndCompany
);

module.exports = router;