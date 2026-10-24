const { schedulerTickMs } = require('../config/env');
const settingsService = require('./settings.service');
const emailService = require('./email.service');
const logger = require('../utils/logger');

let timer = null;
let running = false;
let lastFailAt = 0;
const RETRY_AFTER_FAIL_MS = 15 * 60e3;

/** Runs every minute; sends the status report when the dashboard interval has passed. */
async function tick() {
  if (running) return;
  running = true;
  try {
    const { email } = settingsService.get();
    const rep = email.report;
    if (!email.enabled || !rep.enabled) return;

    if (!rep.lastSentAt) { await settingsService.markReportSent(new Date()); return; } // start the clock

    const due = Date.now() - new Date(rep.lastSentAt).getTime() >= rep.intervalHours * 3600e3;
    if (!due || Date.now() - lastFailAt < RETRY_AFTER_FAIL_MS) return;

    const result = await emailService.sendStatusReport();
    if (result.ok) {
      await settingsService.markReportSent(new Date());
      logger.info(`Scheduled status report done (${result.message})`);
    } else {
      lastFailAt = Date.now();
      logger.warn(`Scheduled status report not sent: ${result.message}. Retrying in 15 minutes`);
    }
  } catch (err) {
    logger.error(`Scheduler error: ${err.message}`);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, schedulerTickMs);
  logger.info(`Report scheduler started (checks every ${Math.round(schedulerTickMs / 1000)}s)`);
}

module.exports = { start, tick };
