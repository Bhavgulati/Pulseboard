const pool = require('../config/database');

// Create workspace
const createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    // Create workspace
    const result = await pool.query(
      `INSERT INTO workspaces (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, userId]
    );

    const workspace = result.rows[0];

    // Auto-add creator as admin member
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspace.id, userId]
    );

    res.status(201).json({
      message: 'Workspace created successfully',
      workspace
    });

  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get my workspaces
const getMyWorkspaces = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT w.*, wm.role as my_role,
        (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count
       FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );

    res.json({
      workspaces: result.rows
    });

  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get single workspace
const getWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if user is a member
    const memberCheck = await pool.query(
      `SELECT * FROM workspace_members 
       WHERE workspace_id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get workspace with members
    const workspace = await pool.query(
      `SELECT * FROM workspaces WHERE id = $1`,
      [id]
    );

    const members = await pool.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, wm.role, wm.joined_at
       FROM workspace_members wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [id]
    );

    res.json({
      workspace: workspace.rows[0],
      members: members.rows
    });

  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Invite member
const inviteMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;
    const userId = req.user.userId;

    // Check if requester is admin
    const adminCheck = await pool.query(
      `SELECT * FROM workspace_members 
       WHERE workspace_id = $1 AND user_id = $2 AND role = 'admin'`,
      [id, userId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    // Find user by email
    const userResult = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const invitedUserId = userResult.rows[0].id;

    // Add member
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [id, invitedUserId, role || 'member']
    );

    res.json({ message: 'Member invited successfully' });

  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  createWorkspace, 
  getMyWorkspaces, 
  getWorkspace,
  inviteMember 
};