const express = require('express');
const router = express.Router();
var auth = require('../middleware/auth');

const userCtr = require('../controller/userController');
router.get('/getAllUser', auth.authenticateToken, userCtr.getAllUser);
router.put('/editUser/:id',auth.authenticateToken, userCtr.updateUser);
router.get('/getUserById/:id',auth.authenticateToken, userCtr.getUserById);
module.exports = router;