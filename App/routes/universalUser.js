const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const universalUserController = require('../controllers/universalUserController');

// All routes require authentication and universal_user role (checked in controller)
router.use(auth);

// Universal User Management Routes
router.post('/users', universalUserController.createUserAnyCompany);
router.get('/users', universalUserController.getAllUsersAllCompanies);
router.put('/users/:userId', universalUserController.updateUserAnyCompany);
router.delete('/users/:userId', universalUserController.deleteUserAnyCompany);

// Company Management Routes
router.get('/companies', universalUserController.getAllCompanies);
router.post('/companies', universalUserController.createCompany);
router.put('/companies/:companyId', universalUserController.updateCompany);
router.delete('/companies/:companyId', universalUserController.deleteCompany);

module.exports = router; 