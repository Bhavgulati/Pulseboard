const pool = require('../config/database');
const { addNotificationJob } = require('../queues/notificationQueue');

// Add comment to task
const addComment = async (req, res) => {
  try {
    const { task_id, content } = req.body;
    const userId = req.user.userId;

    if (!task_id || !content) {
      return res.status(400).json({ error: 'Task ID and content are required' });
    }

    // Get task details for notification
    const task = await pool.query(
      `SELECT t.*, u.name as creator_name 
       FROM tasks t
       JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [task_id]
    );

    if (task.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get commenter name
    const commenter = await pool.query(
      'SELECT name FROM users WHERE id = $1',
      [userId]
    );

    // Save comment
    const result = await pool.query(
      `INSERT INTO comments (task_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [task_id, userId, content]
    );

    const comment = result.rows[0];

    // Add commenter info to response
    const fullComment = {
      ...comment,
      user_name: commenter.rows[0].name,
      user_id: userId
    };

    // Real-time — broadcast to everyone viewing this task
    const io = req.app.get('io');
    io.to(`task:${task_id}`).emit('comment_added', {
      comment: fullComment
    });

    // Notify task owner if commenter is different person
    if (task.rows[0].created_by !== userId) {
      await addNotificationJob('task_comment', {
        taskOwnerId: task.rows[0].created_by,
        commenterName: commenter.rows[0].name,
        taskTitle: task.rows[0].title,
        taskId: task_id,
        comment: content
      });
    }

    res.status(201).json({
      message: 'Comment added',
      comment: fullComment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all comments for a task
const getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [taskId]
    );

    res.json({ comments: result.rows });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Edit comment
const editComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    // Only comment owner can edit
    const comment = await pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );

    if (comment.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const result = await pool.query(
      `UPDATE comments
       SET content = $1, edited = TRUE, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [content, id]
    );

    // Real-time update
    const io = req.app.get('io');
    io.to(`task:${comment.rows[0].task_id}`).emit('comment_edited', {
      comment: result.rows[0]
    });

    res.json({
      message: 'Comment updated',
      comment: result.rows[0]
    });

  } catch (error) {
    console.error('Edit comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete comment
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const comment = await pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );

    if (comment.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await pool.query('DELETE FROM comments WHERE id = $1', [id]);

    // Real-time update
    const io = req.app.get('io');
    io.to(`task:${comment.rows[0].task_id}`).emit('comment_deleted', {
      commentId: id,
      taskId: comment.rows[0].task_id
    });

    res.json({ message: 'Comment deleted' });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { addComment, getTaskComments, editComment, deleteComment };