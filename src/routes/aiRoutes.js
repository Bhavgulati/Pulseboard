const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { generateSprint, generateSprintSync } = require('../controllers/aiController');

router.use(authenticate);

router.post('/sprint-plan', generateSprint);
router.post('/sprint-plan-sync', generateSprintSync); // for testing

module.exports = router;