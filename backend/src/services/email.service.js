const nodemailer = require('nodemailer');
const { smtp, dashboardUrl } = require('../config/env');
const { pool } = require('../config/db');
const settingsService = require('./settings.service');
const { buildReport } = require('./report.service');
const tpl = require('../utils/emailTemplates');
const logger = require('../utils/logger');

let transporter = null;
const lastNotified = new Map(); // api_name -> time of last instant email (cooldown)

const isConfigured = () => Boolean(smtp.host && smtp.user && smtp.pass);

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10000, socketTimeout: 15000,
    });
  }
  return transporter;
}

async function logEmail({ kind, recipients, subject, alertCount, status, error }) {
  try {
    await pool.query(
      `INSERT INTO email_log (kind, recipients, subject, alert_count, status, error) VALUES ($1,$2,$3,$4,$5,$6)`,
      [kind, recipients, subject, alertCount, status, error || null]);
  } catch (err) { logger.error(`Could not write email_log: ${err.message}`); }
}

/** Sends one email to the dashboard recipients and records the result. Never throws. */
async function deliver({ kind, subject, text, html, alertCount = 0 }) {
  const recipients = settingsService.get().email.recipients;
  const base = { kind, recipients, subject, alertCount };
  if (!recipients.length) return { ok: false, skipped: true, message: 'No recipients configured' };
  if (!isConfigured()) {
    await logEmail({ ...base, status: 'skipped', error: 'SMTP is not configured in .env' });
    return { ok: false, skipped: true, message: 'SMTP is not configured in .env (SMTP_HOST, SMTP_USER, SMTP_PASS)' };
  }
  try {
    await getTransporter().sendMail({ from: smtp.from, to: recipients.join(', '), subject, text, html });
    await logEmail({ ...base, status: 'sent' });
    logger.info(`Email sent: "${subject}" to ${recipients.length} recipient(s)`);
    return { ok: true, message: `Sent to ${recipients.length} recipient(s)` };
  } catch (err) {
    await logEmail({ ...base, status: 'failed', error: err.message });
    logger.error(`Email failed: ${err.message}`);
    return { ok: false, message: `Email failed: ${err.message}` };
  }
}

/** Called after /monitor saves new alerts. Applies the "instant alert" rules from the dashboard. */
async function notifyNewAlerts(alerts) {
  const { email } = settingsService.get();
  const rule = email.instant;
  if (!email.enabled || !rule.enabled || !alerts.length) return;

  const cooldownMs = rule.cooldownMinutes * 60e3;
  const now = Date.now();
  const toSend = alerts.filter((a) =>
    rule.severities.includes(a.severity) &&
    a.issues.some((i) => rule.issueTypes.includes(i)) &&
    !(cooldownMs && lastNotified.has(a.api_name) && now - lastNotified.get(a.api_name) < cooldownMs));
  if (!toSend.length) return;

  const mail = tpl.instantEmail(toSend, { dashboardUrl });
  const result = await deliver({ kind: 'instant', ...mail, alertCount: toSend.length });
  if (result.ok) toSend.forEach((a) => lastNotified.set(a.api_name, now));
}

async function sendStatusReport() {
  const settings = settingsService.get();
  const report = await buildReport();
  if (settings.email.report.skipWhenHealthy && report.counts.active === 0) {
    return { ok: true, skipped: true, message: 'No active alerts, report skipped (as configured)' };
  }
  const mail = tpl.reportEmail(report, settings.email.report, { dashboardUrl });
  return deliver({ kind: 'report', ...mail, alertCount: report.counts.active });
}

async function sendTestEmail() {
  return deliver({ kind: 'test', ...tpl.testEmail({ dashboardUrl }) });
}

async function getEmailLog(limit = 15) {
  const { rows } = await pool.query(`SELECT * FROM email_log ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}

module.exports = { isConfigured, notifyNewAlerts, sendStatusReport, sendTestEmail, getEmailLog };
