require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const commentRoutes = require('./routes/commentRoutes');
const sprintRoutes = require('./routes/sprintRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { authenticate } = require('./middleware/authMiddleware');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const webhookRoutes = require('./routes/webhookRoutes');
const app = express();

// ✅ MIDDLEWARE ALWAYS FIRST
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// ✅ RATE LIMITING SECOND
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ✅ ROUTES ALWAYS LAST
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/sprints', sprintRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/webhooks', webhookRoutes);

// Protected test route
app.get('/api/me', authenticate, (req, res) => {
  res.json({ 
    message: 'You are authenticated',
    user: req.user 
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'PulseBoard API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;