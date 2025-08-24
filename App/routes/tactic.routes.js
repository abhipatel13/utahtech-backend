const express = require('express');
const router = express.Router();
const tactics = require('../controllers/tactic.controller');
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

// Universal user route - bypasses company access
router.get("/universal", tactics.findAllUniversal);

// Apply company access middleware to other routes
router.use(ensureCompanyAccess('tactics'));

// Create a new Tactic
router.post('/', 
  requireJsonBody(),
  validateRequired(['analysis_name', 'location']),
  sanitizeInputs(['analysis_name', 'location']),
  tactics.create
);

// Retrieve all Tactics
router.get('/', tactics.findAll);

// Get tactics by company (for universal users only)
router.get('/company/:company_id',
  requireRole(['universal_user']),
  tactics.findAll
);

// Get tactics by site (for universal users only)
router.get('/site/:site_id',
  requireRole(['universal_user']),
  tactics.findAll
);

// Retrieve a single Tactic with id
router.get('/:id', 
  validateIdParam('id'),
  tactics.findOne
);

// Update a Tactic with id
router.put('/:id', 
  validateIdParam('id'),
  requireJsonBody(),
  sanitizeInputs(['analysis_name', 'location']),
  tactics.update
);

// Delete a Tactic with id
router.delete('/:id', 
  validateIdParam('id'),
  requireRole(['admin', 'superuser']),
  tactics.delete
);

module.exports = router; 