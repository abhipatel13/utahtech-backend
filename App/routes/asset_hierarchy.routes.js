const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const assetHierarchyController = require('../controllers/asset_hierarchy.controller');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// File filter to only accept CSV files
const fileFilter = (req, file, cb) => {
  // Accept any file that ends with .csv
  if (file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Error handling middleware for multer
const handleUploadError = (err, req, res, next) => {
  console.log('Upload error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: false,
        message: 'File size too large. Maximum size is 10MB.'
      });
    }
    return res.status(400).json({
      status: false,
      message: err.message
    });
  } else if (err) {
    return res.status(400).json({
      status: false,
      message: err.message
    });
  }
  next();
};

// Routes
router.post('/create', assetHierarchyController.create);
router.post('/upload', upload.single('file'), handleUploadError, assetHierarchyController.uploadCSV);
router.get('/', assetHierarchyController.findAll);
router.get('/:id', assetHierarchyController.findOne);

module.exports = router; 