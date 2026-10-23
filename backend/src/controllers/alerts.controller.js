const alertService = require('../services/alert.service');

exports.list = async (req, res, next) => {
  try {
    const { status, severity } = req.query;
    if (status && !['active', 'resolved', 'all'].includes(status))
      return res.status(400).json({ success: false, error: 'status must be active, resolved or all' });
    if (severity && !['warning', 'critical'].includes(severity))
      return res.status(400).json({ success: false, error: 'severity must be warning or critical' });
    const alerts = await alertService.getAlerts({
      status: req.query.status || 'active',
      severity: req.query.severity,
      api_name: req.query.api_name,
    });
    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    next(err);
  }
};

exports.resolve = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid alert id' });
    const alert = await alertService.resolveAlert(id);
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, alert });
  } catch (err) {
    next(err);
  }
};
