const ISSUE_TYPES = ['high_latency', 'failed_request', 'zero_records'];
const SEVERITIES = ['critical', 'warning'];

const createTablesSQL = `
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_log (
  id          SERIAL PRIMARY KEY,
  kind        TEXT        NOT NULL,
  recipients  TEXT[]      NOT NULL DEFAULT '{}',
  subject     TEXT        NOT NULL,
  alert_count INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);
`;

function defaults(defaultRecipients = []) {
  return {
    thresholds: {
      latencyWarningMs: 2000,
      latencyCriticalMs: 4000,
      errorStatusFrom: 400,      // HTTP status >= this is a failed request
      criticalStatusFrom: 500,   // HTTP status >= this is critical
      minRecords: 1,             // fewer records than this = "no records" (0 turns the check off)
      escalateMultipleIssues: true,
    },
    email: {
      enabled: defaultRecipients.length > 0,
      recipients: defaultRecipients,
      instant: { enabled: true, severities: ['critical'], issueTypes: [...ISSUE_TYPES], cooldownMinutes: 30 },
      report: {
        enabled: true, intervalHours: 2, severities: [...SEVERITIES], issueTypes: [...ISSUE_TYPES],
        skipWhenHealthy: false, lastSentAt: null,
      },
    },
  };
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Checks input from the dashboard. Returns { value, errors }. Unknown keys are ignored. */
function validate(input, current) {
  const errors = [];
  const t = input?.thresholds || {}, e = input?.email || {}, i = e.instant || {}, r = e.report || {};
  const ct = current.thresholds, ce = current.email;

  const num = (v, label, min, max, fallback, int = true) => {
    if (v === undefined || v === null) return fallback;
    const n = v === '' ? NaN : Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
      errors.push(`${label} must be ${int ? 'a whole number' : 'a number'} between ${min} and ${max}`);
      return fallback;
    }
    return n;
  };
  const bool = (v, fb) => (typeof v === 'boolean' ? v : fb);
  const subset = (v, allowed, label, fb) => {
    if (v === undefined) return fb;
    if (!Array.isArray(v) || v.some((x) => !allowed.includes(x))) { errors.push(`${label} has an invalid value`); return fb; }
    if (!v.length) { errors.push(`${label}: pick at least one`); return fb; }
    return [...new Set(v)];
  };

  const thresholds = {
    latencyWarningMs: num(t.latencyWarningMs, 'Slow response (warning)', 50, 600000, ct.latencyWarningMs),
    latencyCriticalMs: num(t.latencyCriticalMs, 'Slow response (critical)', 50, 600000, ct.latencyCriticalMs),
    errorStatusFrom: num(t.errorStatusFrom, 'Failed request from HTTP status', 100, 599, ct.errorStatusFrom),
    criticalStatusFrom: num(t.criticalStatusFrom, 'Critical from HTTP status', 100, 599, ct.criticalStatusFrom),
    minRecords: num(t.minRecords, 'Minimum records', 0, 1000000, ct.minRecords),
    escalateMultipleIssues: bool(t.escalateMultipleIssues, ct.escalateMultipleIssues),
  };
  if (thresholds.latencyCriticalMs <= thresholds.latencyWarningMs)
    errors.push('Critical response time must be higher than the warning response time');
  if (thresholds.criticalStatusFrom < thresholds.errorStatusFrom)
    errors.push('Critical HTTP status cannot be lower than the failed-request status');

  let recipients = ce.recipients;
  if (e.recipients !== undefined) {
    if (!Array.isArray(e.recipients)) errors.push('Recipients must be a list');
    else {
      recipients = [...new Set(e.recipients.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
      const bad = recipients.filter((x) => !EMAIL_RE.test(x));
      if (bad.length) errors.push(`Invalid email address: ${bad.slice(0, 3).join(', ')}`);
      if (recipients.length > 20) errors.push('At most 20 recipients are allowed');
    }
  }
  const enabled = bool(e.enabled, ce.enabled);
  if (enabled && recipients.length === 0) errors.push('Add at least one recipient to turn email on');

  const email = {
    enabled,
    recipients,
    instant: {
      enabled: bool(i.enabled, ce.instant.enabled),
      severities: subset(i.severities, SEVERITIES, 'Instant alert severities', ce.instant.severities),
      issueTypes: subset(i.issueTypes, ISSUE_TYPES, 'Instant alert issue types', ce.instant.issueTypes),
      cooldownMinutes: num(i.cooldownMinutes, 'Cooldown', 0, 1440, ce.instant.cooldownMinutes),
    },
    report: {
      enabled: bool(r.enabled, ce.report.enabled),
      intervalHours: num(r.intervalHours, 'Report interval (hours)', 1, 168, ce.report.intervalHours),
      severities: subset(r.severities, SEVERITIES, 'Report severities', ce.report.severities),
      issueTypes: subset(r.issueTypes, ISSUE_TYPES, 'Report issue types', ce.report.issueTypes),
      skipWhenHealthy: bool(r.skipWhenHealthy, ce.report.skipWhenHealthy),
      lastSentAt: ce.report.lastSentAt, // server-managed, never taken from the client
    },
  };
  return { value: { thresholds, email }, errors };
}

module.exports = { ISSUE_TYPES, SEVERITIES, createTablesSQL, defaults, validate };
