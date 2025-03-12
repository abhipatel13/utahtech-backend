const express = require("express");
const router = express.Router();
const task_hazards = require("../controllers/task_hazard.controller.js");

// Create a new Task Hazard
router.post("/", task_hazards.create);

// Retrieve all Task Hazards
router.get("/", task_hazards.findAll);

// Retrieve a single Task Hazard with id
router.get("/:id", task_hazards.findOne);

module.exports = router; 