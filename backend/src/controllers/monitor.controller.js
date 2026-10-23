const { detectAnomaly } = require('../services/detection.service');
const { generateAlertMessage } = require('../services/llm.service');
const { saveAlerts } = require('../services/alert.service');
const { sendAnomalyReport } = require('../services/email.service');
const logger = require('../utils/logger');

exports.monitor = async (req, res, next) => {
  try {
    const items = req.validItems;
    logger.info(`Received ${req.body.length} records (${items.length} valid)`);

    // 1. Detect (fast, synchronous rules)
    const anomalies = items.map(detectAnomaly).filter(Boolean);

    // 2. Generate all AI messages in parallel (scalability)
    const withMessages = await Promise.all(
      anomalies.map(async (a) => ({ ...a, ...(await generateAlertMessage(a)) }))
    );

    // 3. Store
    const saved = withMessages.length ? await saveAlerts(withMessages) : [];
    logger.info(`Stored ${saved.length} anomalies`);

    // 4. Optional email (fire and forget)
    sendAnomalyReport(withMessages);

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
