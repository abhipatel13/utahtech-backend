const express = require("express");
const router = express.Router();
const risk_assessments = require("../controllers/risk_assessment.controller.js");
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');

// Apply middleware to all routes
router.use(auth);
router.use(ensureCompanyAccess('risk_assessments'));

// Create a new Risk Assessment
router.post("/", risk_assessments.create);

// Retrieve all Risk Assessments
router.get("/", risk_assessments.findAll);

// Retrieve a single Risk Assessment with id
router.get("/:id", risk_assessments.findOne);

// Update a Risk Assessment with id
router.put("/:id", risk_assessments.update);

// Delete a Risk Assessment with id
router.delete("/:id", risk_assessments.delete);

module.exports = router; 