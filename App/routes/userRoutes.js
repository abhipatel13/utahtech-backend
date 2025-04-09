const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Get all users and supervisors (admin only)
router.get('/all', authenticateToken, authorizeRole(['admin', 'superuser']), async (req, res) => {
  try {
    // Find all users with role 'user' or 'supervisor'
    const users = await User.find({ 
      role: { $in: ['user', 'supervisor'] },
      company: req.user.company // Only show users from the same company
    }).select('-password'); // Exclude password from response

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Create a new user (admin only)
router.post('/', authenticateToken, authorizeRole(['admin', 'superuser']), async (req, res) => {
  try {
    const { email, password, role, company } = req.body;

    // Validate role
    if (!['user', 'supervisor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be user or supervisor' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      role,
      company: req.user.company // Use admin's company
    });

    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'superuser']), async (req, res) => {
  try {
    const { email, role } = req.body;
    const userId = req.params.id;

    // Validate role
    if (role && !['user', 'supervisor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be user or supervisor' });
    }

    // Find and update user
    const user = await User.findOneAndUpdate(
      { 
        _id: userId,
        company: req.user.company // Only allow updating users from the same company
      },
      { email, role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, authorizeRole(['admin', 'superuser']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Find and delete user
    const user = await User.findOneAndDelete({
      _id: userId,
      company: req.user.company // Only allow deleting users from the same company
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

module.exports = router; 