const express = require("express");
const router = express.Router();
const risk_assessments = require("../controllers/risk_assessment.controller.js");
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');
const { 
  validateRequired, 
  requireRole, 
  validateIdParam,
  requireJsonBody,
  sanitizeInputs,
  validateDateTime,
  validateArray,
  validatePagination,
  validateSearch
} = require('../middleware/validation');

// Apply middleware to all routes
router.use(auth);

// Universal user routes - bypass company access
router.get("/universal", risk_assessments.findAllUniversal);
router.delete("/universal/:id", 
  validateIdParam('id'),
  requireRole(['universal_user']),
  risk_assessments.deleteUniversal
);

// Apply company access middleware to other routes
router.use(ensureCompanyAccess('risk_assessments'));

// Create a new Risk Assessment
router.post("/", 
  requireJsonBody(),
  validateRequired(['date', 'time', 'scopeOfWork', 'individuals', 'supervisor', 'location']),
  validateDateTime(),
  validateArray('risks', true),
  sanitizeInputs(['scopeOfWork', 'individuals', 'supervisor', 'location']),
  risk_assessments.create
);

// Retrieve all Risk Assessments
router.get("/", 
  validatePagination(),
  validateSearch(),
  risk_assessments.findAll
);

// Retrieve Risk Assessments with minimal data (optimized for tables)
router.get("/minimal", 
  validatePagination(),
  validateSearch(),
  risk_assessments.findAllMinimal
);

// Retrieve a single Risk Assessment with id
router.get("/:id", 
  validateIdParam('id'),
  risk_assessments.findOne
);

// Update a Risk Assessment with id
router.put("/:id", 
  validateIdParam('id'),
  requireJsonBody(),
  validateDateTime(),
  sanitizeInputs(['scopeOfWork', 'individuals', 'supervisor', 'location']),
  risk_assessments.update
);

// Delete a Risk Assessment with id
router.delete("/:id", 
  validateIdParam('id'),
  requireRole(['admin', 'superuser']),
  risk_assessments.delete
);

module.exports = router; 