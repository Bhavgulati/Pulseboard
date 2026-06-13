const pool = require('../config/database');

// Create project
const createProject = async (req, res) => {
  try {
    const { workspace_id, name, description } = req.body;

    if (!workspace_id || !name) {
      return res.status(400).json({ error: 'Workspace ID and name are required' });
    }

    const result = await pool.query(
      `INSERT INTO projects (workspace_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [workspace_id, name, description]
    );

    res.status(201).json({
      message: 'Project created successfully',
      project: result.rows[0]
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get projects in workspace
const getWorkspaceProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const result = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as completed_count
       FROM projects p
       WHERE p.workspace_id = $1
       ORDER BY p.created_at DESC`,
      [workspaceId]
    );

    res.json({ projects: result.rows });

  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createProject, getWorkspaceProjects };