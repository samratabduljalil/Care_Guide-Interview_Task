// Accepts an array. Splits it into valid and rejected items,
// so one bad entry never blocks the rest (batch-safe).
function isValid(i) {
  return (
    i && typeof i === 'object' &&
    typeof i.api_name === 'string' && i.api_name.trim() !== '' && i.api_name.length <= 100 &&
    Number.isFinite(i.response_time_ms) &&
    Number.isInteger(i.status_code) &&
    Number.isFinite(i.records_returned)
  );
}

module.exports = function validateMonitorInput(req, res, next) {
  if (!Array.isArray(req.body) || req.body.length === 0) {
    return res.status(400).json({ success: false, error: 'Body must be a non-empty JSON array' });
  }
  req.validItems = req.body.filter(isValid);
  req.rejectedItems = req.body.map((item, index) => (isValid(item) ? -1 : index)).filter((i) => i >= 0);
  next();
};
