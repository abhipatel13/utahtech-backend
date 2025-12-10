const express = require("express");
const router = express.Router();
const supervisor_approvals = require("../controllers/supervisor_approval.controller.js");
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');
const { 
  validateRequired, 
  requireRole, 
  validateIdParam,
  requireJsonBody,
  sanitizeInputs
} = require('../middleware/validation');

// Apply middleware to all routes
router.use(auth);

// Apply company access middleware
router.use(ensureCompanyAccess('supervisor_approvals'));

/**
 * Get all supervisor approvals grouped by approvable entity
 * - Admin/superuser: Can see all approvals for the company
 * - Supervisor: Can only see approvals they are responsible for
 * 
 * Query parameters:
 * - status: 'pending', 'approved', 'rejected', or 'all' (default)
 * - type or approvableType: 'task_hazards', 'risk_assessments', or 'all' (default)  
 * - includeInvalidated: 'true' or 'false' (default)
 */
router.get("/", 
  requireRole(['admin', 'superuser', 'supervisor']),
  supervisor_approvals.getAllApprovals
);

/**
 * Process a supervisor approval (approve or reject)
 * Works with both task hazards and risk assessments
 * 
 * Body parameters:
 * - status: 'Approved' or 'Rejected' (required)
 * - comments: string (optional)
 */
router.put("/:id", 
  validateIdParam('id'),
  requireRole(['supervisor', 'admin', 'superuser']),
  requireJsonBody(),
  validateRequired(['status']),
  sanitizeInputs(['comments']),
  supervisor_approvals.processApproval
);

/**
 * Get approval history for a specific approvable entity
 * Returns all approval records including invalidated ones for audit trail
 * 
 * Query parameters:
 * - approvableType: 'task_hazards' or 'risk_assessments' (required)
 */
router.get("/:id/history", 
  validateIdParam('id'),
  supervisor_approvals.getApprovalHistory
);

module.exports = router;





