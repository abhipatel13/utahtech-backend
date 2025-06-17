const { Router } = require('express');

const router = Router();
// require('../models/user');
const adminRoutes = require('./admin');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const taskHazardRoutes = require('./task_hazard.routes');
const assetHierarchyRoutes = require('./asset_hierarchy.routes');
const tacticRoutes = require('./tacticRoutes');
const paymentRoutes = require('./payment.routes');

// Remove this import as we're handling it directly in app.js
// const taskHazardRoutes = require('./task_hazard.routes');

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/user', userRoutes);
router.use('/task-hazards', taskHazardRoutes);
router.use('/asset-hierarchy', assetHierarchyRoutes);
router.use('/users', userRoutes);
router.use('/tactics', tacticRoutes);
router.use('/payments', paymentRoutes);
// Remove this line as we're handling it directly in app.js
// router.use('/task-hazards', taskHazardRoutes);

module.exports = router;
