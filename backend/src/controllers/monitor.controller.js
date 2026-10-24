const { detectAnomaly } = require('../services/detection.service');
const { generateAlertMessage } = require('../services/llm.service');
const { saveAlerts } = require('../services/alert.service');
const settingsService = require('../services/settings.service');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

exports.monitor = async (req, res, next) => {
  try {
    const items = req.validItems;
    logger.info(`Received ${req.body.length} records (${items.length} valid)`);

    // 1. Detect, using the thresholds currently set in the dashboard
    const { thresholds } = settingsService.get();
    const anomalies = items.map((i) => detectAnomaly(i, thresholds)).filter(Boolean);

    // 2. Generate all AI messages in parallel (scalability)
    const withMessages = await Promise.all(
      anomalies.map(async (a) => ({ ...a, ...(await generateAlertMessage(a)) }))
    );

    // 3. Store
    const saved = withMessages.length ? await saveAlerts(withMessages) : [];
    logger.info(`Stored ${saved.length} anomalies`);

    // 4. Instant email, in the background so the response is not delayed
    emailService.notifyNewAlerts(saved).catch((err) => logger.error(`Notify failed: ${err.message}`));

    res.status(201).json({
      success: true,
      total_received: req.body.length,
      total_processed: items.length,
      rejected_indexes: req.rejectedItems,
      anomalies_found: saved.length,
      alerts: saved,
    });
  } catch (err) {
    next(err);
  }
};
