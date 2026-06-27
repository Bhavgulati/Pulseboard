const crypto = require('crypto');
const axios = require('axios');
const { addNotificationJob } = require('../queues/notificationQueue');

/**
 * GITHUB WEBHOOK HANDLER
 * 
 * GitHub sends a POST request here when:
 * - PR is opened
 * - PR is updated
 * - PR is closed
 * 
 * Security: GitHub signs every webhook with a secret.
 * We verify the signature before processing.
 */

// Verify webhook is actually from GitHub
const verifyGitHubSignature = (payload, signature, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
};

const handleGitHubWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const payload = JSON.stringify(req.body);

    // Step 1 — Verify signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'pulseboard_webhook_secret';
    
    if (signature) {
      const isValid = verifyGitHubSignature(payload, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    console.log(`GitHub webhook received: ${event}`);

    // Step 2 — Handle PR events
    if (event === 'pull_request') {
      const { action, pull_request, repository } = req.body;

      // Only review when PR is opened or updated
      if (action === 'opened' || action === 'synchronize') {
        console.log(`PR #${pull_request.number} ${action}: ${pull_request.title}`);
        
      // Get the diff
      let diff = '';
      try {
        const diffResponse = await axios.get(pull_request.diff_url, {
            headers: { 
                'Accept': 'application/vnd.github.v3.diff',
                'Authorization': `token ${process.env.GITHUB_TOKEN}`
            }
        });
        diff = diffResponse.data;
       }catch (diffError) {
        console.log('Could not fetch diff:', diffError.message);
        diff = `PR #${pull_request.number}: ${pull_request.title}\nAuthor: ${pull_request.user.login}`;
}


        // Add PR review job to BullMQ queue
        await addNotificationJob('pr_review', {
          owner: repository.owner.login,
          repo: repository.name,
          pullNumber: pull_request.number,
          title: pull_request.title,
          author: pull_request.user.login,
          diff: diff,
          githubToken: process.env.GITHUB_TOKEN
        });

        console.log(`PR review job queued for #${pull_request.number}`);

        // Respond to GitHub immediately
        return res.json({ 
          message: 'PR review started',
          pr: pull_request.number 
        });
      }
    }

    // For other events just acknowledge
    res.json({ message: `Event ${event} received` });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

module.exports = { handleGitHubWebhook };