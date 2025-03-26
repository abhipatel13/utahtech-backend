const express = require('express');
const router = express.Router();

var auth = require('../middleware/auth');
const adminCtr = require('../controller/adminController');
router.post('/saveAssetHeirarchy',auth.authenticateToken, adminCtr.saveAssetHeirarchy);
router.get('/getDescendants',auth.authenticateToken,  adminCtr.getDescendants);
router.post('/getRowMatrix',auth.authenticateToken,  adminCtr.getRowMatrix);
router.post('/saveRowMatrix',auth.authenticateToken, adminCtr.saveRowMatrix);
module.exports = router;
