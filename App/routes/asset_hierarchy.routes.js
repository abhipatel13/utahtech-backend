const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const assetHierarchyController = require('../controllers/asset_hierarchy.controller');

// Debug middleware - place this first
router.use((req, res, next) => {
  console.log('Asset Hierarchy Route accessed:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Error handling middleware
const handleError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: false,
      message: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File size too large. Maximum size is 10MB.'
        : err.message
    });
  }
  if (err) {
    return res.status(400).json({
      status: false,
      message: err.message
    });
  }
  next();
};

// Routes
router.post('/create', assetHierarchyController.create);
router.post('/upload-csv', upload.single('file'), handleError, assetHierarchyController.uploadCSV);
router.get('/', assetHierarchyController.findAll);
router.get('/:id', assetHierarchyController.findOne);

module.exports = router; 