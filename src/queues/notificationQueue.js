const { Queue } = require('bullmq');
const { bullMQRedis } = require('../config/redis');

const notificationQueue = new Queue('notifications', {
  connection: bullMQRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});
/**
 * NOTIFICATION QUEUE
 * 
 * This is the PRODUCER side.
 * Main server adds jobs here.
 * Worker picks them up separately.
 * 
 * Job types:
 * - task_assigned: someone assigned a task to you
 * - workspace_invite: someone invited you to workspace
 * - task_comment: someone commented on your task
 * - sprint_reminder: sprint deadline approaching
 * - member_joined: new member joined workspace
 */



/**
 * Add notification job to queue
 * Called from controllers when something happens
 */
const addNotificationJob = async (type, data) => {
  await notificationQueue.add(type, data, {
    priority: type === 'task_assigned' ? 1 : 2  // task assignments are high priority
  });
  console.log(`Notification job added: ${type}`);
};

module.exports = { notificationQueue, addNotificationJob };