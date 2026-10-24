const settingsService = require('../services/settings.service');
const emailService = require('../services/email.service');
const { smtp } = require('../config/env');

function payload() {
  const settings = settingsService.get();
  const rep = settings.email.report;
  const next = settings.email.enabled && rep.enabled && rep.lastSentAt
    ? new Date(new Date(rep.lastSentAt).getTime() + rep.intervalHours * 3600e3).toISOString() : null;
  return { success: true, settings, smtp: { configured: emailService.isConfigured(), from: smtp.from || null }, next_report_at: next };
}

exports.get = (req, res) => res.json(payload());

exports.update = async (req, res, next) => {
  try { await settingsService.update(req.body); res.json(payload()); } catch (err) { next(err); }
};

exports.testEmail = async (req, res, next) => {
  try { const r = await emailService.sendTestEmail(); res.json({ success: r.ok, message: r.message }); } catch (err) { next(err); }
};

exports.sendReport = async (req, res, next) => {
  try { const r = await emailService.sendStatusReport(); res.json({ success: r.ok, message: r.message }); } catch (err) { next(err); }
};

exports.emailLog = async (req, res, next) => {
  try { res.json({ success: true, log: await emailService.getEmailLog(15) }); } catch (err) { next(err); }
};
