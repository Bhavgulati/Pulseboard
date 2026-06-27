const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { 
  getWorkspaceAnalytics,
  getProjectAnalytics,
  getMemberAnalytics
} = require('../controllers/analyticsController');

router.use(authenticate);

router.get('/workspace/:workspaceId', getWorkspaceAnalytics);
router.get('/project/:projectId', getProjectAnalytics);
router.get('/me/:workspaceId', getMemberAnalytics);

module.exports = router;