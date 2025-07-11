const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const models = require('../models');
const User = models.user;
const { auth, checkRole } = require('../middleware/auth');
const authController = require('../controller/authController');

// Register new user (admin only)
router.post('/register', auth, checkRole(['superuser', 'admin']), async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    const user = await User.create({
      email,
      password,
      role: role || 'user'
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password, company } = req.body;
    
    // Find user by email
    const db = require('../models');

    console.log(email);
    console.log(password);
    console.log(company);

    const user = await db.sequelize.models.user.scope('auth').findOne({
      where: { email:email }
    });

    console.log(user);

    if (!user) {
      return res.status(401).json({
        status: false,
        message: 'Invalid email, password, or company' 
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        status: false,
        message: 'Invalid email, password, or company' 
      });
    }
    
    // Update last login
    await user.updateLastLogin();
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role, company: user.company },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Return user data and token
    res.json({
      status: true,
      data: {
        user: {
          _id: user.id,
          email: user.email,
          role: user.role,
          company_id: user.company_id,
          company: user.company
        },
        token
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      status: false,
      message: 'Server error' 
    });
  }
});

// Logout user
router.post('/logout', auth, async (req, res) => {
  try {
    // In a stateless JWT system, we don't need to do anything on the server
    // The client will handle removing the token
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        ...user.toJSON(),
        permissions: user.getPermissions()
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new route for finding user by email and company
router.post('/find-user', async (req, res) => {
    await authController.findUserByEmailAndCompany(req, res);
});

module.exports = router;