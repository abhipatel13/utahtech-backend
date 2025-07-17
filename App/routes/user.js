const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const userCtr = require('../controller/userController');

// Get all users (with full data)
router.get('/getAllUser', auth, userCtr.getAllUser);

// Get all users (restricted data)
router.get('/getAllUserRestricted', auth, userCtr.getAllUserRestricted);

// Create new user
router.post('/createUser', auth, userCtr.createUser);

// Get user by ID
router.get('/getUserById/:id', auth, userCtr.getUserById);

// Update user (superuser only)
router.put('/editUser/:id', auth, userCtr.updateUser);

// Delete user (superuser only)
router.delete('/deleteUser/:id', auth, userCtr.deleteUser);

// Reset user password (superuser only)
router.put('/resetPassword/:id', auth, userCtr.resetUserPassword);

module.exports = router;