/**
 * Checks one API result against the thresholds set in the dashboard.
 * Returns null if healthy, otherwise { api_name, issues, severity, metrics }.
 */
function detectAnomaly(item, t) {
  const { api_name, response_time_ms, status_code, records_returned } = item;
  const issues = [];

  if (response_time_ms > t.latencyWarningMs) issues.push('high_latency');
  if (status_code >= t.errorStatusFrom) issues.push('failed_request');
  if (records_returned < t.minRecords) issues.push('zero_records');

  if (issues.length === 0) return null;

  const critical =
    status_code >= t.criticalStatusFrom ||
    response_time_ms > t.latencyCriticalMs ||
    (t.escalateMultipleIssues && issues.length >= 2);

  return {
    api_name,
    issues,
    severity: critical ? 'critical' : 'warning',
    metrics: { response_time_ms, status_code, records_returned },
  };
}

module.exports = { detectAnomaly };
