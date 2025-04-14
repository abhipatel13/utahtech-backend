const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');

// Get all users and supervisors (admin only)
router.get('/all', auth, checkRole(['admin', 'superuser']), async (req, res) => {
  try {
    const connection = await User.getConnection();
    let query;
    let params;

    if (req.user.role === 'superuser') {
      // Superuser can see all users including other admins
      query = 'SELECT id, email, role, company FROM users';
      params = [];
    } else {
      // Regular admin can only see users and supervisors from their company
      query = 'SELECT id, email, role, company FROM users WHERE role IN (?, ?) AND company = ?';
      params = ['user', 'supervisor', req.user.company];
    }

    const [users] = await connection.execute(query, params);
    
    console.log('Found users:', users);
    res.json({
      status: true,
      data: users,
      message: 'Users fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      status: false,
      message: 'Error fetching users' 
    });
  }
});

// Create new user (admin only)
router.post('/', auth, checkRole(['admin', 'superuser']), async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate role
    if (!['user', 'supervisor'].includes(role)) {
      return res.status(400).json({ 
        status: false,
        message: 'Invalid role. Must be either user or supervisor' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ 
        status: false,
        message: 'User already exists' 
      });
    }

    // Create new user
    const user = await User.create({
      email,
      password,
      role,
      company: req.user.company
    });

    res.status(201).json({
      status: true,
      data: user.toJSON(),
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      status: false,
      message: 'Error creating user' 
    });
  }
});

// Update user (admin only)
router.put('/:id', auth, checkRole(['admin', 'superuser']), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ 
        status: false,
        message: 'User not found' 
      });
    }

    // Verify user belongs to same company
    if (user.company !== req.user.company) {
      return res.status(403).json({ 
        status: false,
        message: 'Cannot update user from different company' 
      });
    }

    // Update user
    const connection = await User.getConnection();
    await connection.execute(
      'UPDATE users SET email = ?, role = ? WHERE id = ?',
      [email, role, id]
    );

    res.json({
      status: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      status: false,
      message: 'Error updating user' 
    });
  }
});

// Delete user (admin only)
router.delete('/:id', auth, checkRole(['admin', 'superuser']), async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ 
        status: false,
        message: 'User not found' 
      });
    }

    // Verify user belongs to same company
    if (user.company !== req.user.company) {
      return res.status(403).json({ 
        status: false,
        message: 'Cannot delete user from different company' 
      });
    }

    // Delete user
    const connection = await User.getConnection();
    await connection.execute('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      status: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      status: false,
      message: 'Error deleting user' 
    });
  }
});

module.exports = router; 