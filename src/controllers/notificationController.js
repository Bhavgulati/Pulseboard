const pool = require('../config/database');

// Get my notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    const unreadCount = result.rows.filter(n => !n.read).length;

    res.json({
      notifications: result.rows,
      unread_count: unreadCount
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    await pool.query(
      `UPDATE notifications 
       SET read = TRUE 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ message: 'Notification marked as read' });

  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark ALL notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    await pool.query(
      `UPDATE notifications 
       SET read = TRUE 
       WHERE user_id = $1 AND read = FALSE`,
      [userId]
    );

    res.json({ message: 'All notifications marked as read' });

  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    await pool.query(
      `DELETE FROM notifications 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ message: 'Notification deleted' });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  deleteNotification 
};