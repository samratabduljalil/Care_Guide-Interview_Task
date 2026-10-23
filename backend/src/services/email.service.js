const nodemailer = require('nodemailer');
const { email } = require('../config/env');
const logger = require('../utils/logger');

let transporter;
if (email.enabled) {
  transporter = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    auth: { user: email.user, pass: email.pass },
  });
}

async function sendAnomalyReport(alerts) {
  if (!email.enabled || alerts.length === 0) return;
  try {
    const body = alerts
      .map((a) => `[${a.severity.toUpperCase()}] ${a.api_name}: ${a.message}`)
      .join('\n\n');
    await transporter.sendMail({
      from: email.user,
      to: email.to,
      subject: `API Monitor: ${alerts.length} anomaly(ies) detected`,
      text: body,
    });
    logger.info(`Email report sent (${alerts.length} alerts)`);
  } catch (err) {
    logger.error(`Email failed: ${err.message}`); // never break /monitor because of email
  }
}

module.exports = { sendAnomalyReport };
