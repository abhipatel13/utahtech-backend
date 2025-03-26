const { Router } = require('express');

const router = Router();
// require('../models/user');
const adminRoutes = require('./admin');
const authRoutes = require('./auth');
const userRoutes = require('./user');
// Remove this import as we're handling it directly in app.js
// const taskHazardRoutes = require('./task_hazard.routes');

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/user', userRoutes);
// Remove this line as we're handling it directly in app.js
// router.use('/task-hazards', taskHazardRoutes);

module.exports = router;
