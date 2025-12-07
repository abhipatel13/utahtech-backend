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

// Universal user routes - bypass company access
router.delete("/universal/:id", 
  validateIdParam('id'),
  requireRole(['universal_user']),
  assetHierarchyController.deleteUniversal
);

router.use(ensureCompanyAccess('asset_hierarchy'));

// Supported file types for asset upload
const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls
];

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

// Configure multer for file upload (CSV and Excel)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const isAllowedMime = ALLOWED_MIMETYPES.includes(file.mimetype);
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(extension);
    
    if (isAllowedMime || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV (.csv) and Excel (.xlsx, .xls) files are allowed.'));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB to accommodate larger Excel files
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
  requireRole(['admin', 'superuser']),
  validateArray('assets', true),
  assetHierarchyController.create
);

// Upload file for bulk asset import (CSV or Excel)
router.post('/upload',
  requireRole(['admin', 'superuser']),
  upload.single('file'),
  handleUploadError,
  assetHierarchyController.uploadAssets
);

// Legacy endpoint - redirects to new upload endpoint
// @deprecated Use /upload instead
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