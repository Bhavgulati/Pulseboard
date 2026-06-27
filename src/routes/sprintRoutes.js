const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
  createSprint,
  getProjectSprints,
  getSprint,
  addTaskToSprint,
  removeTaskFromSprint,
  updateSprintStatus,
  getTeamVelocity
} = require('../controllers/sprintController');

router.use(authenticate);

router.post('/', createSprint);
router.get('/project/:projectId', getProjectSprints);
router.get('/velocity/:projectId', getTeamVelocity);
router.get('/:id', getSprint);
router.post('/:id/tasks', addTaskToSprint);
router.delete('/:id/tasks/:taskId', removeTaskFromSprint);
router.patch('/:id/status', updateSprintStatus);

module.exports = router;