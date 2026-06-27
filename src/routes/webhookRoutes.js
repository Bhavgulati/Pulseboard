const express = require('express');
const router = express.Router();
const { handleGitHubWebhook } = require('../controllers/webhookController');

// No auth middleware — GitHub calls this directly
router.post('/github', handleGitHubWebhook);

module.exports = router;