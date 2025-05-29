const express = require('express');
const router = express.Router();
const tactics = require('../controllers/tactic.controller');
const { auth, checkPermission } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');

// Apply middleware to all routes
router.use(auth);
router.use(ensureCompanyAccess('tactics'));

// Create a new Tactic
router.post('/', tactics.create);

// Retrieve all Tactics
router.get('/', tactics.findAll);

// Retrieve a single Tactic with id
router.get('/:id', tactics.findOne);

// Update a Tactic with id
router.put('/:id', tactics.update);

// Delete a Tactic with id
router.delete('/:id', tactics.delete);

module.exports = router; 