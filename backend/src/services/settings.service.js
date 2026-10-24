const { pool } = require('../config/db');
const { smtp } = require('../config/env');
const { createTablesSQL, defaults, validate } = require('../models/Settings');
const logger = require('../utils/logger');

let cache = null;

function merge(base, stored) {
  if (stored === undefined || stored === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return stored;
  const out = { ...base };
  for (const k of Object.keys(base)) out[k] = merge(base[k], stored[k]);
  return out;
}

async function init() {
  await pool.query(createTablesSQL);
  const def = defaults(smtp.defaultTo);
  await pool.query(`INSERT INTO settings (key, value) VALUES ('app', $1) ON CONFLICT (key) DO NOTHING`, [def]);
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key = 'app'`);
  cache = merge(def, rows[0].value); // new settings added in future versions get their defaults
  logger.info('Settings loaded');
  return cache;
}

const get = () => cache;

async function update(input) {
  const { value, errors } = validate(input, cache);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.status = 400; err.expose = true; err.errors = errors;
    throw err;
  }
  // when reports become active, start the interval from now
  const wasActive = cache.email.enabled && cache.email.report.enabled;
  const nowActive = value.email.enabled && value.email.report.enabled;
  if (!wasActive && nowActive) value.email.report.lastSentAt = new Date().toISOString();

  await pool.query(`UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'app'`, [value]);
  cache = value;
  logger.info('Settings updated from dashboard');
  return cache;
}

async function markReportSent(date = new Date()) {
  const iso = date.toISOString();
  await pool.query(
    `UPDATE settings SET value = jsonb_set(value, '{email,report,lastSentAt}', to_jsonb($1::text)) WHERE key = 'app'`, [iso]);
  cache.email.report.lastSentAt = iso;
}

module.exports = { init, get, update, markReportSent };
