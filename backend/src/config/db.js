const { Pool } = require('pg');
const { databaseUrl } = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({ connectionString: databaseUrl });

pool.on('error', (err) => logger.error(`Unexpected PostgreSQL error: ${err.message}`));

// Connects and makes sure the table exists.
async function connectDB() {
  try {
    await pool.query('SELECT 1');
    await pool.query(require('../models/Alert').createTableSQL);
    logger.info('PostgreSQL connected, alerts table ready');
  } catch (err) {
    logger.error(`PostgreSQL connection failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { pool, connectDB };
