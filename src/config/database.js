require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'pulseboard',
      user: process.env.DB_USER || 'pulse_user',
      password: process.env.DB_PASSWORD || 'pulse_pass',
    });

pool.on('connect', () => {
  console.log('Connected to PulseBoard database');
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

module.exports = pool;