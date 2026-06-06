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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'PulseBoard API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;