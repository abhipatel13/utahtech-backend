const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const userCtr = require('../controller/userController');

router.get('/getAllUser', auth, userCtr.getAllUser);
router.put('/editUser/:id', auth, userCtr.updateUser);
router.get('/getUserById/:id', auth, userCtr.getUserById);
router.delete('/deleteUser/:id', auth, userCtr.deleteUser);

module.exports = router;