const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'PulseBoard API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;