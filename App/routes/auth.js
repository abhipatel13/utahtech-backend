const express = require('express');
const router = express.Router();

const authCtr = require('../controller/authController');
router.post('/register', authCtr.register);
router.post('/login', authCtr.login);
router.post('/forgot-password', authCtr.forgotPassword);
router.post('/reset-password', authCtr.resetPassword);
module.exports = router;