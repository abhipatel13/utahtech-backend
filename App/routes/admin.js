const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const adminCtr = require('../controller/adminController');

router.post('/saveAssetHeirarchy', auth, adminCtr.saveAssetHeirarchy);
router.get('/getDescendants', auth, adminCtr.getDescendants);
router.post('/getRowMatrix', auth, adminCtr.getRowMatrix);
router.post('/saveRowMatrix', auth, adminCtr.saveRowMatrix);

module.exports = router;
