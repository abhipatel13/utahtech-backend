const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const { 
  validateRequired, 
  validateEmail, 
  requireRole, 
  validateIdParam,
  requireJsonBody,
  sanitizeInputs
} = require('../middleware/validation');
const userCtr = require('../controllers/userController');

// Get all users (with full data)
router.get('/getAllUser', auth, requireRole(['admin', 'superuser']), userCtr.getAllUser);

// Get all users (restricted data)
router.get('/getAllUserRestricted', auth, userCtr.getAllUserRestricted);

// Create new user
router.post('/createUser', 
  auth, 
  requireRole(['superuser']),
  requireJsonBody(),
  validateRequired(['email', 'password', 'role']),
  validateEmail('email'),
  sanitizeInputs(['name', 'email']),
  userCtr.createUser
);

// Get user by ID
router.get('/getUserById/:id', auth, validateIdParam('id'), userCtr.getUserById);

// Update user (superuser only)
router.put('/editUser/:id', 
  auth, 
  requireRole(['superuser']),
  validateIdParam('id'),
  requireJsonBody(),
  sanitizeInputs(['name', 'email']),
  userCtr.updateUser
);

// Delete user (superuser only)
router.delete('/deleteUser/:id', 
  auth, 
  requireRole(['superuser']),
  validateIdParam('id'),
  userCtr.deleteUser
);

// Reset user password (superuser only)
router.put('/resetPassword/:id', 
  auth, 
  requireRole(['superuser']),
  validateIdParam('id'),
  requireJsonBody(),
  validateRequired(['newPassword']),
  userCtr.resetUserPassword
);

module.exports = router;