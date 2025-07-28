const { Router } = require('express');

const router = Router();
const adminRoutes = require('./admin');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const taskHazardRoutes = require('./task_hazard.routes');
const assetHierarchyRoutes = require('./asset_hierarchy.routes');
const tacticRoutes = require('./tactic.routes');
const riskAssessmentRoutes = require('./risk_assessment.routes');
const notificationRoutes = require('./notification.routes');
const licenseRoutes = require('./license.routes');

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/user', userRoutes);
router.use('/task-hazards', taskHazardRoutes);
router.use('/asset-hierarchy', assetHierarchyRoutes);
router.use('/users', userRoutes);
router.use('/tactics', tacticRoutes);
router.use('/risk-assessments', riskAssessmentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/licenses', licenseRoutes);

module.exports = router;
