const pool = require('../config/database');

// Create sprint
const createSprint = async (req, res) => {
  try {
    const { project_id, name, goal, start_date, end_date } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'Project ID and name are required' });
    }

    const result = await pool.query(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, name, goal, start_date, end_date]
    );

    res.status(201).json({
      message: 'Sprint created successfully',
      sprint: result.rows[0]
    });

  } catch (error) {
    console.error('Create sprint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all sprints for a project
const getProjectSprints = async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT s.*,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
        SUM(t.story_points) as total_points,
        SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END) as completed_points
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id
       WHERE s.project_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [projectId]
    );

    res.json({ sprints: result.rows });

  } catch (error) {
    console.error('Get sprints error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get single sprint with tasks
const getSprint = async (req, res) => {
  try {
    const { id } = req.params;

    const sprint = await pool.query(
      'SELECT * FROM sprints WHERE id = $1',
      [id]
    );

    if (sprint.rows.length === 0) {
      return res.status(404).json({ error: 'Sprint not found' });
    }

    // Get tasks in this sprint
    const tasks = await pool.query(
      `SELECT t.*, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.sprint_id = $1
       ORDER BY t.priority DESC`,
      [id]
    );

    // Calculate velocity
    const totalPoints = tasks.rows.reduce((sum, t) => sum + (t.story_points || 0), 0);
    const completedPoints = tasks.rows
      .filter(t => t.status === 'done')
      .reduce((sum, t) => sum + (t.story_points || 0), 0);

    // Burndown data — tasks completed per day
    const burndown = await pool.query(
      `SELECT DATE(updated_at) as date, 
        SUM(story_points) as points_completed
       FROM tasks
       WHERE sprint_id = $1 AND status = 'done'
       GROUP BY DATE(updated_at)
       ORDER BY date ASC`,
      [id]
    );

    res.json({
      sprint: sprint.rows[0],
      tasks: tasks.rows,
      metrics: {
        total_tasks: tasks.rows.length,
        completed_tasks: tasks.rows.filter(t => t.status === 'done').length,
        total_points: totalPoints,
        completed_points: completedPoints,
        velocity: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0
      },
      burndown: burndown.rows
    });

  } catch (error) {
    console.error('Get sprint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add task to sprint
const addTaskToSprint = async (req, res) => {
  try {
    const { id } = req.params;
    const { task_id } = req.body;

    // Check sprint exists
    const sprint = await pool.query(
      'SELECT * FROM sprints WHERE id = $1',
      [id]
    );

    if (sprint.rows.length === 0) {
      return res.status(404).json({ error: 'Sprint not found' });
    }

    await pool.query(
      'UPDATE tasks SET sprint_id = $1 WHERE id = $2',
      [id, task_id]
    );

    res.json({ message: 'Task added to sprint' });

  } catch (error) {
    console.error('Add task to sprint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Remove task from sprint
const removeTaskFromSprint = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    await pool.query(
      'UPDATE tasks SET sprint_id = NULL WHERE id = $1 AND sprint_id = $2',
      [taskId, id]
    );

    res.json({ message: 'Task removed from sprint' });

  } catch (error) {
    console.error('Remove task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update sprint status
const updateSprintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['planning', 'active', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE sprints 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sprint not found' });
    }

    res.json({
      message: 'Sprint status updated',
      sprint: result.rows[0]
    });

  } catch (error) {
    console.error('Update sprint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get team velocity (past sprints data for AI planner)
const getTeamVelocity = async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT 
        s.id,
        s.name,
        s.start_date,
        s.end_date,
        s.status,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
        COALESCE(SUM(t.story_points), 0) as total_points,
        COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id
       WHERE s.project_id = $1 AND s.status = 'completed'
       GROUP BY s.id
       ORDER BY s.end_date DESC
       LIMIT 5`,
      [projectId]
    );

    // Calculate average velocity
    const avgVelocity = result.rows.length > 0
      ? Math.round(result.rows.reduce((sum, s) => sum + parseInt(s.completed_points), 0) / result.rows.length)
      : 0;

    res.json({
      past_sprints: result.rows,
      average_velocity: avgVelocity,
      message: 'Velocity data ready for AI sprint planner'
    });

  } catch (error) {
    console.error('Get velocity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createSprint,
  getProjectSprints,
  getSprint,
  addTaskToSprint,
  removeTaskFromSprint,
  updateSprintStatus,
  getTeamVelocity
};