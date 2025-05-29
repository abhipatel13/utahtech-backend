const express = require("express");
const router = express.Router();
const task_hazards = require("../controllers/task_hazard.controller.js");
const { auth } = require('../middleware/auth');
const { ensureCompanyAccess } = require('../middleware/companyAccess');

// Apply middleware to all routes
router.use(auth);
router.use(ensureCompanyAccess('task_hazards'));

// Create a new Task Hazard
router.post("/", task_hazards.create);

// Retrieve all Task Hazards
router.get("/", task_hazards.findAll);

// Retrieve a single Task Hazard with id
router.get("/:id", task_hazards.findOne);

// Update a Task Hazard with id
router.put("/:id", task_hazards.update);

// Delete a Task Hazard with id
router.delete("/:id", task_hazards.delete);

module.exports = router; 