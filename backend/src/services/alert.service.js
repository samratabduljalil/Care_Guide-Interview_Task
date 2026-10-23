const { pool } = require('../config/db');
const { toAlert } = require('../models/Alert');

// Inserts many alerts with ONE query (efficient for batches).
async function saveAlerts(alerts) {
  if (alerts.length === 0) return [];

  const values = [];
  const placeholders = alerts.map((a, i) => {
    const o = i * 8;
    values.push(
      a.api_name, a.issues, a.severity, a.message, a.ai_generated,
      a.metrics.response_time_ms, a.metrics.status_code, a.metrics.records_returned
    );
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
  });

  const { rows } = await pool.query(
    `INSERT INTO alerts
       (api_name, issues, severity, message, ai_generated, response_time_ms, status_code, records_returned)
     VALUES ${placeholders.join(', ')}
     RETURNING *`,
    values
  );
  return rows.map(toAlert);
}

async function getAlerts({ status = 'active', severity, api_name } = {}) {
  const conditions = [];
  const params = [];
  if (status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
  if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
  if (api_name) { params.push(api_name); conditions.push(`api_name = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT * FROM alerts ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
     ORDER BY created_at DESC LIMIT 500`,
    params
  );
  return rows.map(toAlert);
}

async function resolveAlert(id) {
  const { rows } = await pool.query(
    `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] ? toAlert(rows[0]) : null;
}

module.exports = { saveAlerts, getAlerts, resolveAlert };
