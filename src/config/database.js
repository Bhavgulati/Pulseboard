const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'pulseboard',
  user: 'pulse_user',
  password: 'pulse_pass',
});

pool.on('connect', () => {
  console.log('Connected to PulseBoard database');
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

module.exports = pool;