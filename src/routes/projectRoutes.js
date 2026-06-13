const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { createProject, getWorkspaceProjects } = require('../controllers/projectController');

router.use(authenticate);

router.post('/', createProject);
router.get('/workspace/:workspaceId', getWorkspaceProjects);

module.exports = router;