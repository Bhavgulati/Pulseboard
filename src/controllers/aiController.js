const { generateSprintPlan } = require('../ai/sprintPlanner');
const { addNotificationJob } = require('../queues/notificationQueue');
require('dotenv').config();

const generateSprint = async (req, res) => {
  try {
    const { project_id } = req.body;
    const userId = req.user.userId;

    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Respond immediately — AI runs in background
    res.json({
      message: 'AI Sprint Planner started. This takes 20-30 seconds.',
      status: 'processing',
      project_id
    });

    // Run LangGraph in background
    try {
      const result = await generateSprintPlan(project_id);

      // Notify user when done via BullMQ
      await addNotificationJob('sprint_plan_ready', {
        taskOwnerId: userId,
        sprintPlan: result.sprintPlan,
        projectId: project_id,
        velocity: result.velocity,
        iterations: result.iterations
      });

      console.log('Sprint plan generated and notification queued');
    } catch (aiError) {
      console.error('AI Sprint planning failed:', aiError);
    }

  } catch (error) {
    console.error('Generate sprint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Synchronous version for testing
const generateSprintSync = async (req, res) => {
  try {
    const { project_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    console.log('Running AI Sprint Planner synchronously for testing...');
    const result = await generateSprintPlan(project_id);

    res.json({
      message: 'Sprint plan generated',
      result
    });

  } catch (error) {
    console.error('Generate sprint sync error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { generateSprint, generateSprintSync };