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