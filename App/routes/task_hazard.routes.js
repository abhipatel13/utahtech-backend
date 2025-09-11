const express = require("express");
const router = express.Router();
const task_hazards = require("../controllers/task_hazard.controller.js");
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
router.get("/universal",
  requireRole(['universal_user']),
  validatePagination(),
  task_hazards.findAll);
router.delete("/universal/:id", 
  validateIdParam('id'),
  requireRole(['universal_user']),
  task_hazards.deleteUniversal
);

// Apply company access middleware to other routes
router.use(ensureCompanyAccess('task_hazards'));

// Create a new Task Hazard
router.post("/", 
  requireJsonBody(),
  validateRequired(['date', 'time', 'scopeOfWork', 'individuals', 'supervisor', 'location']),
  validateDateTime(),
  validateArray('risks', true),
  sanitizeInputs(['scopeOfWork', 'individuals', 'supervisor', 'location']),
  task_hazards.create
);

// Note: Supervisor approval endpoints have been moved to /supervisor-approvals
// These routes are kept for backward compatibility but return 410 Gone
router.get("/approvals", 
  requireRole(['admin', 'superuser', 'supervisor']),
  task_hazards.getAllApprovals
);

router.put("/:id/approval", 
  validateIdParam('id'),
  requireRole(['supervisor', 'admin', 'superuser']),
  requireJsonBody(),
  task_hazards.supervisorApproval
);

router.get("/:id/approval-history", 
  validateIdParam('id'),
  task_hazards.getApprovalHistory
);

// Retrieve all Task Hazards with pagination
router.get("/", 
  validatePagination(),
  validateSearch(),
  task_hazards.findAll
);

// Retrieve Task Hazards with minimal data (optimized for tables)
router.get("/minimal", 
  validatePagination(),
  validateSearch(),
  task_hazards.findAllMinimal
);

// Get task hazards by company (for universal users only)
router.get("/company/:company_id",
  requireRole(['universal_user']),
  validatePagination(),
  task_hazards.findByCompany
);

// Retrieve a single Task Hazard with id
router.get("/:id", 
  validateIdParam('id'),
  task_hazards.findOne
);

// Update a Task Hazard with id
router.put("/:id", 
  validateIdParam('id'),
  requireJsonBody(),
  validateDateTime(),
  sanitizeInputs(['scopeOfWork', 'individuals', 'supervisor', 'location', 'trainedWorkforce']),
  task_hazards.update
);

// Delete a Task Hazard with id
router.delete("/:id", 
  validateIdParam('id'),
  requireRole(['admin', 'superuser']),
  task_hazards.delete
);

module.exports = router; 