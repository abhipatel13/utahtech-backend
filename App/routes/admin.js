const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const { 
  validateRequired, 
  requireRole, 
  requireJsonBody,
  validateArray,
  sanitizeInputs
} = require('../middleware/validation');
const adminCtr = require('../controllers/adminController');

// Save Asset Hierarchy (bulk create)
router.post('/saveAssetHierarchy', 
  auth, 
  requireRole(['admin', 'superuser']),
  requireJsonBody(),
  validateArray('assets', true),
  adminCtr.saveAssetHeirarchy
);

// Get Asset Descendants (hierarchy tree)
router.get('/getDescendants', 
  auth, 
  requireRole(['admin', 'superuser']),
  adminCtr.getDescendants
);

// Get Risk Matrix
router.post('/getRowMatrix', 
  auth, 
  requireRole(['admin', 'superuser']),
  requireJsonBody(),
  validateRequired(['user_id', 'mat_type']),
  adminCtr.getRowMatrix
);

// Save Risk Matrix
router.post('/saveRowMatrix', 
  auth, 
  requireRole(['admin', 'superuser']),
  requireJsonBody(),
  validateRequired(['user_id', 'mat_type', 'matrices']),
  validateArray('matrices', true),
  adminCtr.saveRowMatrix
);

module.exports = router;
