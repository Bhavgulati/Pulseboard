const pool = require('../config/database');

// Create task
const createTask = async (req, res) => {
  try {
    const { project_id, title, description, priority, assignee_id, due_date, story_points } = req.body;
    const userId = req.user.userId;

    if (!project_id || !title) {
      return res.status(400).json({ error: 'Project ID and title are required' });
    }

    const result = await pool.query(
      `INSERT INTO tasks 
        (project_id, title, description, priority, assignee_id, due_date, story_points, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [project_id, title, description, priority || 'medium', assignee_id, due_date, story_points || 1, userId]
    );

    res.status(201).json({
      message: 'Task created successfully',
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all tasks for a project
const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT t.*, 
        u.name as assignee_name, 
        u.email as assignee_email,
        u.avatar_url as assignee_avatar
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC`,
      [projectId]
    );

    // Group by status for Kanban board
    const kanban = {
      todo: result.rows.filter(t => t.status === 'todo'),
      in_progress: result.rows.filter(t => t.status === 'in_progress'),
      review: result.rows.filter(t => t.status === 'review'),
      done: result.rows.filter(t => t.status === 'done')
    };

    res.json({ tasks: result.rows, kanban });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update task status (drag and drop)
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'review', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE tasks 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      message: 'Task status updated',
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update task details
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assignee_id, due_date, story_points } = req.body;

    const result = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           priority = COALESCE($3, priority),
           assignee_id = COALESCE($4, assignee_id),
           due_date = COALESCE($5, due_date),
           story_points = COALESCE($6, story_points),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, description, priority, assignee_id, due_date, story_points, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      message: 'Task updated',
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete task
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  createTask, 
  getProjectTasks, 
  updateTaskStatus,
  updateTask,
  deleteTask 
};