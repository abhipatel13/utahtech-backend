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
  validateRequired(['date', 'time', 'scopeOfWork', 'individual', 'supervisor', 'location']),
  validateDateTime(),
  validateArray('risks', true),
  sanitizeInputs(['scopeOfWork', 'individual', 'supervisor', 'location']),
  task_hazards.create
);

// Get supervisor approvals grouped by task (admin/superuser: all company approvals, supervisor: own approvals only)
router.get("/approvals", 
  requireRole(['admin', 'superuser', 'supervisor']),
  task_hazards.getAllApprovals
);

// Approve or deny a Task Hazard
router.put("/:id/approval", 
  validateIdParam('id'),
  requireRole(['supervisor', 'admin', 'superuser']),
  requireJsonBody(),
  validateRequired(['status']),
  sanitizeInputs(['comments']),
  task_hazards.supervisorApproval
);

// Get approval history for a Task Hazard
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
  sanitizeInputs(['scopeOfWork', 'individual', 'supervisor', 'location', 'trainedWorkforce']),
  task_hazards.update
);

// Delete a Task Hazard with id
router.delete("/:id", 
  validateIdParam('id'),
  requireRole(['admin', 'superuser']),
  task_hazards.delete
);

module.exports = router; 