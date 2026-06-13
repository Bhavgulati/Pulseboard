const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
  createTask,
  getProjectTasks,
  updateTaskStatus,
  updateTask,
  deleteTask
} = require('../controllers/taskController');

router.use(authenticate);

router.post('/', createTask);
router.get('/project/:projectId', getProjectTasks);
router.patch('/:id/status', updateTaskStatus);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;