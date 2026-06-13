const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const pool = require('./config/database');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
console.log('Auth routes loaded');

const { authenticate } = require('./middleware/authMiddleware');

// Protected test route
app.get('/api/me', authenticate, (req, res) => {
  res.json({ 
    message: 'You are authenticated',
    user: req.user 
  });
});

const workspaceRoutes = require('./routes/workspaceRoutes');
app.use('/api/workspaces', workspaceRoutes);
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');

app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'PulseBoard API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;