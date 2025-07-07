const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const userCtr = require('../controller/userController');

router.get('/getAllUser', auth, userCtr.getAllUser);
router.get('/getAllUserRestricted', auth, userCtr.getAllUserRestricted);
router.put('/editUser/:id', auth, userCtr.updateUser);
router.post('/createUser', auth, userCtr.createUser);
router.get('/getUserById/:id', auth, userCtr.getUserById);
router.delete('/deleteUser/:id', auth, userCtr.deleteUser);

module.exports = router;