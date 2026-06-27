const { Worker } = require('bullmq');
const { bullMQRedis } = require('../config/redis');
const pool = require('../config/database');

/**
 * NOTIFICATION WORKER
 * 
 * This is the CONSUMER side.
 * Runs as a separate process.
 * Picks jobs from queue and processes them.
 * 
 * In production this would run on a separate server.
 * For now it runs alongside our main server.
 */

const processNotification = async (job) => {
  const type = job.name;
  const data = job.data;

  console.log(`Processing notification job: ${type}`, data);

  switch (type) {

    case 'task_assigned': {
      /**
       * Someone assigned a task to a user
       * Save notification to DB
       * WebSocket will deliver it if user is online
       */
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.assigneeId,
          'task_assigned',
          'New task assigned to you',
          `${data.assignerName} assigned "${data.taskTitle}" to you`,
          JSON.stringify(data)
        ]
      );
      console.log(`Task assignment notification saved for user ${data.assigneeId}`);
      break;
    }

    case 'workspace_invite': {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.invitedUserId,
          'workspace_invite',
          'Workspace invitation',
          `${data.inviterName} invited you to join "${data.workspaceName}"`,
          JSON.stringify(data)
        ]
      );
      console.log(`Workspace invite notification saved for user ${data.invitedUserId}`);
      break;
    }

    case 'task_comment': {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.taskOwnerId,
          'task_comment',
          'New comment on your task',
          `${data.commenterName} commented on "${data.taskTitle}"`,
          JSON.stringify(data)
        ]
      );
      console.log(`Comment notification saved for user ${data.taskOwnerId}`);
      break;
    }


    case 'sprint_plan_ready': {
        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                data.taskOwnerId,
                'sprint_plan_ready',
                'Your AI sprint plan is ready',
                `Sprint plan generated with ${data.sprintPlan?.selectedTasks?.length || 0} tasks and ${data.velocity} velocity points`,
                JSON.stringify(data)
            ]
        );
        console.log('Sprint plan ready notification saved');
        break;
    }

    case 'pr_review': {
  console.log(`Starting AI review for PR #${data.pullNumber}`);
  
  const { reviewPullRequest } = require('../ai/prReviewer');
  
  const review = await reviewPullRequest({
    owner: data.owner,
    repo: data.repo,
    pullNumber: data.pullNumber,
    diff: data.diff,
    githubToken: data.githubToken
  });

  console.log(`PR #${data.pullNumber} review complete. Score: ${review.overallScore}/100`);
  break;
}

    case 'sprint_reminder': {
      /**
       * Sprint deadline approaching
       * Notify all workspace members
       */
      for (const memberId of data.memberIds) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            memberId,
            'sprint_reminder',
            'Sprint ending soon',
            `Sprint "${data.sprintName}" ends in ${data.hoursLeft} hours`,
            JSON.stringify(data)
          ]
        );
      }
      console.log(`Sprint reminder sent to ${data.memberIds.length} members`);
      break;
    }

    case 'member_joined': {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.ownerId,
          'member_joined',
          'New member joined',
          `${data.newMemberName} joined your workspace "${data.workspaceName}"`,
          JSON.stringify(data)
        ]
      );
      console.log(`Member joined notification saved`);
      break;
    }

    default:
      console.log(`Unknown notification type: ${type}`);
  }
};

// Create worker
const notificationWorker = new Worker(
  'notifications',
  processNotification,
  {
    connection: bullMQRedis,
    concurrency: 5
  }
);

// Worker events
notificationWorker.on('completed', (job) => {
  console.log(`Notification job ${job.id} completed`);
});

notificationWorker.on('failed', (job, error) => {
  console.error(`Notification job ${job.id} failed:`, error.message);
});

notificationWorker.on('error', (error) => {
  console.error('Worker error:', error);
});

console.log('Notification worker started');

module.exports = { notificationWorker };