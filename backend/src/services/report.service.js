const alertService = require('./alert.service');
const settingsService = require('./settings.service');

/** Builds the data for the periodic status report, using the dashboard's report filters. */
async function buildReport() {
  const s = settingsService.get().email.report;
  const all = await alertService.getAlerts({ status: 'all' });
  const match = (a) => s.severities.includes(a.severity) && a.issues.some((i) => s.issueTypes.includes(i));
  const since = s.lastSentAt ? new Date(s.lastSentAt) : new Date(Date.now() - s.intervalHours * 3600e3);

  const active = all.filter((a) => a.status === 'active' && match(a));
  const byIssue = {};
  active.forEach((a) => a.issues.filter((i) => s.issueTypes.includes(i)).forEach((i) => { byIssue[i] = (byIssue[i] || 0) + 1; }));

  const groups = {};
  active.forEach((a) => { (groups[a.api_name] ||= []).push(a); });
  const apis = Object.entries(groups).map(([name, list]) => ({
    name, count: list.length,
    worst: list.some((a) => a.severity === 'critical') ? 'critical' : 'warning',
    latest: list[0].message,
  })).sort((x, y) => (y.worst === 'critical') - (x.worst === 'critical') || y.count - x.count);

  const critical = active.filter((a) => a.severity === 'critical').length;
  return {
    generatedAt: new Date(), since,
    counts: { active: active.length, critical, warning: active.length - critical, apis: apis.length },
    byIssue, apis, latest: active.slice(0, 8),
    newSince: all.filter((a) => match(a) && new Date(a.created_at) >= since).length,
    resolvedSince: all.filter((a) => match(a) && a.resolved_at && new Date(a.resolved_at) >= since).length,
  };
}

module.exports = { buildReport };
