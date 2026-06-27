const pool = require('../config/database');
const { redis } = require('../config/redis');

// Helper — cache wrapper
const getCachedOrFetch = async (cacheKey, fetchFn, ttlSeconds = 300) => {
  try {
    // Check Redis first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return { data: JSON.parse(cached), fromCache: true };
    }

    // Cache miss — fetch from DB
    const data = await fetchFn();

    // Store in Redis with TTL
    await redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));

    return { data, fromCache: false };
  } catch (error) {
    // If Redis fails, just fetch from DB
    const data = await fetchFn();
    return { data, fromCache: false };
  }
};

// Workspace overview analytics
const getWorkspaceAnalytics = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const cacheKey = `analytics:workspace:${workspaceId}`;

    const { data, fromCache } = await getCachedOrFetch(cacheKey, async () => {
      // Total members
      const members = await pool.query(
        'SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = $1',
        [workspaceId]
      );

      // Total projects
      const projects = await pool.query(
        'SELECT COUNT(*) as count FROM projects WHERE workspace_id = $1',
        [workspaceId]
      );

      // Total tasks across all projects
      const tasks = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed,
          COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN t.status = 'todo' THEN 1 END) as todo,
          COUNT(CASE WHEN t.status = 'review' THEN 1 END) as review
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE p.workspace_id = $1`,
        [workspaceId]
      );

      // Task completion rate
      const total = parseInt(tasks.rows[0].total);
      const completed = parseInt(tasks.rows[0].completed);
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        members: parseInt(members.rows[0].count),
        projects: parseInt(projects.rows[0].count),
        tasks: tasks.rows[0],
        completion_rate: completionRate
      };
    });

    res.json({ 
      analytics: data,
      cached: fromCache,
      cache_ttl: '5 minutes'
    });

  } catch (error) {
    console.error('Workspace analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Project analytics
const getProjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const cacheKey = `analytics:project:${projectId}`;

    const { data, fromCache } = await getCachedOrFetch(cacheKey, async () => {
      // Task breakdown by status
      const taskBreakdown = await pool.query(
        `SELECT 
          status,
          COUNT(*) as count,
          SUM(story_points) as total_points
         FROM tasks
         WHERE project_id = $1
         GROUP BY status`,
        [projectId]
      );

      // Task breakdown by priority
      const priorityBreakdown = await pool.query(
        `SELECT 
          priority,
          COUNT(*) as count
         FROM tasks
         WHERE project_id = $1
         GROUP BY priority`,
        [projectId]
      );

      // Member contribution
      const memberContribution = await pool.query(
        `SELECT 
          u.id,
          u.name,
          COUNT(t.id) as assigned_tasks,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
          COALESCE(SUM(t.story_points), 0) as total_points
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id = $1
         WHERE t.project_id = $1
         GROUP BY u.id, u.name
         ORDER BY completed_tasks DESC`,
        [projectId]
      );

      // Sprint velocity history
      const velocityHistory = await pool.query(
        `SELECT 
          s.name,
          s.start_date,
          s.end_date,
          COALESCE(SUM(t.story_points), 0) as total_points,
          COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points
         FROM sprints s
         LEFT JOIN tasks t ON t.sprint_id = s.id
         WHERE s.project_id = $1
         GROUP BY s.id
         ORDER BY s.start_date ASC`,
        [projectId]
      );

      // Blocker detection — tasks in same status for more than 3 days
      const blockers = await pool.query(
        `SELECT 
          id, title, status, priority,
          assignee_id,
          EXTRACT(DAY FROM NOW() - updated_at) as days_stuck
         FROM tasks
         WHERE project_id = $1
         AND status != 'done'
         AND updated_at < NOW() - INTERVAL '3 days'
         ORDER BY days_stuck DESC`,
        [projectId]
      );

      return {
        task_breakdown: taskBreakdown.rows,
        priority_breakdown: priorityBreakdown.rows,
        member_contribution: memberContribution.rows,
        velocity_history: velocityHistory.rows,
        blockers: blockers.rows,
        blocker_count: blockers.rows.length
      };
    }, 300); // 5 minute cache

    res.json({
      analytics: data,
      cached: fromCache
    });

  } catch (error) {
    console.error('Project analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Individual member analytics
const getMemberAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { workspaceId } = req.params;
    const cacheKey = `analytics:member:${userId}:${workspaceId}`;

    const { data, fromCache } = await getCachedOrFetch(cacheKey, async () => {
      // My tasks summary
      const myTasks = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed,
          COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN t.priority = 'high' THEN 1 END) as high_priority
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE t.assignee_id = $1 AND p.workspace_id = $2`,
        [userId, workspaceId]
      );

      // My recent activity
      const recentActivity = await pool.query(
        `SELECT 
          t.id,
          t.title,
          t.status,
          t.updated_at,
          p.name as project_name
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE t.assignee_id = $1 AND p.workspace_id = $2
         ORDER BY t.updated_at DESC
         LIMIT 10`,
        [userId, workspaceId]
      );

      // My story points completed this week
      const weeklyPoints = await pool.query(
        `SELECT COALESCE(SUM(t.story_points), 0) as points
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE t.assignee_id = $1 
         AND p.workspace_id = $2
         AND t.status = 'done'
         AND t.updated_at >= NOW() - INTERVAL '7 days'`,
        [userId, workspaceId]
      );

      return {
        summary: myTasks.rows[0],
        recent_activity: recentActivity.rows,
        weekly_points: parseInt(weeklyPoints.rows[0].points)
      };
    }, 120); // 2 minute cache for personal data

    res.json({
      analytics: data,
      cached: fromCache
    });

  } catch (error) {
    console.error('Member analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Invalidate cache when data changes
const invalidateCache = async (workspaceId, projectId) => {
  try {
    if (workspaceId) await redis.del(`analytics:workspace:${workspaceId}`);
    if (projectId) await redis.del(`analytics:project:${projectId}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

module.exports = { 
  getWorkspaceAnalytics, 
  getProjectAnalytics,
  getMemberAnalytics,
  invalidateCache
};