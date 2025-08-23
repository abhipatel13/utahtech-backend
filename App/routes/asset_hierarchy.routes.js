const express = require('express');
const router = express.Router();
const multer = require('multer');
const assetHierarchyController = require('../controllers/asset_hierarchy.controller');
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');
const {
  validateRequired,
  requireRole,
  validateIdParam,
  validateUuidParam,
  requireJsonBody,
  sanitizeInputs,
  validateArray
} = require('../middleware/validation');
const { errorResponse, sendResponse } = require('../helper/responseHelper');

router.use(auth);
router.use(ensureCompanyAccess('asset_hierarchy'));

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
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Error handling middleware for file uploads
const handleUploadError = (err, req, res, next) => {
  console.error('Upload error:', err);
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File size too large. Maximum size is 10MB.'
      : err.message;
    const response = errorResponse(message, 400);
    return sendResponse(res, response);
  }
  if (err) {
    const response = errorResponse(err.message, 400);
    return sendResponse(res, response);
  }
  next();
};

// Create new assets
router.post('/',
  requireJsonBody(),
  validateRequired(['assets']),
  validateArray('assets', true),
  assetHierarchyController.create
);

// Upload CSV file for bulk asset import
router.post('/upload-csv',
  requireRole(['admin', 'superuser']),
  upload.single('file'),
  handleUploadError,
  assetHierarchyController.uploadCSV
);

// Get all assets
router.get('/',
  assetHierarchyController.findAll
);

// Get assets by company (for universal users only)
router.get('/company/:company_id',
  requireRole(['universal_user']),
  assetHierarchyController.findByCompany
);

// Get upload history
router.get('/upload-history',
  requireRole(['admin', 'superuser']),
  assetHierarchyController.getUploadHistory
);

// Get upload status by upload ID
router.get('/upload-status/:uploadId',
  requireRole(['admin', 'superuser']),
  validateUuidParam('uploadId'),
  assetHierarchyController.getUploadStatus
);

// Get single asset by ID
router.get('/:id',
  validateIdParam('id'),
  assetHierarchyController.findOne
);

// router.delete('/:id',
//   validateIdParam('id'),
//   assetHierarchyController.delete
// );

module.exports = router; 