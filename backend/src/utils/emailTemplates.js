// Builds { subject, text, html } for each email type. All dynamic values are escaped.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ');
const fmt = (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const LABEL = { high_latency: 'Slow response', failed_request: 'Failed request', zero_records: 'No records' };
const COLOR = { critical: '#b3261e', warning: '#c97620' };

function shell({ title, preheader, body, dashboardUrl, footer }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f7f6;font-family:Segoe UI,Arial,sans-serif;color:#1c2b2a">
<span style="display:none">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dfe7e5">
<tr><td style="background:#154c49;color:#fff;padding:20px 28px">
  <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#bfdcd8">Cottage Home Care &middot; API Monitor</div>
  <div style="font-size:22px;font-weight:700;margin-top:4px">${esc(title)}</div></td></tr>
<tr><td style="padding:24px 28px">${body}
  <p style="margin:24px 0 0"><a href="${esc(dashboardUrl)}" style="background:#e8923a;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:999px;display:inline-block">Open dashboard</a></p></td></tr>
<tr><td style="padding:16px 28px;background:#f8fbfa;color:#5e6f6d;font-size:12px;border-top:1px solid #dfe7e5">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const badge = (sev) => `<span style="background:${sev === 'critical' ? '#fdecea' : '#fff3d6'};color:${COLOR[sev]};font-weight:700;font-size:12px;padding:2px 10px;border-radius:999px;text-transform:uppercase">${esc(sev)}</span>`;

function alertCard(a) {
  const m = a.metrics;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dfe7e5;border-left:5px solid ${COLOR[a.severity]};border-radius:8px;margin:0 0 12px">
<tr><td style="padding:12px 16px"><b style="font-size:16px">${esc(a.api_name)}</b> &nbsp;${badge(a.severity)}
<div style="margin:8px 0">${esc(a.message)}</div>
<div style="color:#5e6f6d;font-size:13px">${a.issues.map((i) => esc(LABEL[i] || i)).join(' &middot; ')} &nbsp;|&nbsp; ${esc(m.response_time_ms)} ms &middot; HTTP ${esc(m.status_code)} &middot; ${esc(m.records_returned)} records &middot; ${esc(fmt(a.created_at))}</div></td></tr></table>`;
}
const alertLine = (a) => `- [${a.severity.toUpperCase()}] ${a.api_name}: ${a.message} (${a.metrics.response_time_ms} ms, HTTP ${a.metrics.status_code}, ${a.metrics.records_returned} records)`;

/* ---------- instant alert ---------- */
function instantEmail(alerts, { dashboardUrl }) {
  const crit = alerts.filter((a) => a.severity === 'critical').length;
  const level = crit ? 'CRITICAL' : 'WARNING';
  const names = [...new Set(alerts.map((a) => a.api_name))];
  const more = names.length > 1 ? ` +${names.length - 1} more` : '';
  const subject = clean(`[${level}] ${names[0]}${more}: ${alerts.length} new alert${alerts.length > 1 ? 's' : ''}`);
  const text = `${alerts.length} new alert(s) detected:\n\n${alerts.map(alertLine).join('\n')}\n\nDashboard: ${dashboardUrl}\n`;
  const html = shell({
    title: `${alerts.length} new alert${alerts.length > 1 ? 's' : ''} detected`,
    preheader: `${names.join(', ')}`,
    body: `<p style="margin:0 0 16px">The monitor found the following problem${alerts.length > 1 ? 's' : ''}:</p>${alerts.map(alertCard).join('')}`,
    dashboardUrl,
    footer: 'You receive this instant alert because it matches the notification settings in the dashboard (Settings &rarr; Instant alerts).',
  });
  return { subject, text, html };
}

/* ---------- periodic status report ---------- */
function reportEmail(r, s, { dashboardUrl }) {
  const c = r.counts;
  const subject = clean(`[API Monitor] Status report: ${c.active ? `${c.active} active alert${c.active > 1 ? 's' : ''} (${c.critical} critical)` : 'all APIs healthy'}`);
  const kpi = (n, label, color) => `<td align="center" style="padding:12px 4px;background:#f4f7f6;border-radius:8px"><div style="font-size:28px;font-weight:700;color:${color}">${n}</div><div style="font-size:12px;color:#5e6f6d;font-weight:700">${label}</div></td>`;
  const gap = '<td width="8"></td>';
  const issueRows = Object.entries(r.byIssue).map(([k, v]) => `<tr><td style="padding:4px 0">${esc(LABEL[k] || k)}</td><td align="right"><b>${v}</b></td></tr>`).join('');
  const apiRows = r.apis.map((a) => `<tr><td style="padding:8px 6px;border-bottom:1px solid #dfe7e5"><b>${esc(a.name)}</b></td><td style="padding:8px 6px;border-bottom:1px solid #dfe7e5">${badge(a.worst)}</td><td style="padding:8px 6px;border-bottom:1px solid #dfe7e5" align="center">${a.count}</td><td style="padding:8px 6px;border-bottom:1px solid #dfe7e5;font-size:13px;color:#5e6f6d">${esc(a.latest)}</td></tr>`).join('');

  const body = `
<p style="margin:0 0 16px;color:#5e6f6d">Status at ${esc(fmt(r.generatedAt))}. Compared with the last report (${esc(fmt(r.since))}): <b>${r.newSince}</b> new, <b>${r.resolvedSince}</b> resolved.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${kpi(c.active, 'ACTIVE ALERTS', '#154c49')}${gap}${kpi(c.critical, 'CRITICAL', '#b3261e')}${gap}${kpi(c.warning, 'WARNING', '#c97620')}${gap}${kpi(c.apis, 'APIs AFFECTED', '#1f6f6b')}
</tr></table>
${c.active ? `
<h3 style="margin:24px 0 8px;font-size:16px">Alert types</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${issueRows}</table>
<h3 style="margin:24px 0 8px;font-size:16px">APIs needing attention</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px"><tr style="text-align:left;color:#5e6f6d;font-size:12px"><th style="padding:6px">API</th><th style="padding:6px">Worst</th><th style="padding:6px">Alerts</th><th style="padding:6px">Latest</th></tr>${apiRows}</table>
<h3 style="margin:24px 0 8px;font-size:16px">Latest active alerts</h3>${r.latest.map(alertCard).join('')}`
    : '<p style="margin:24px 0 0;padding:16px;background:#e3f4ea;color:#1f7a4d;border-radius:8px;font-weight:700">No active alerts match your report settings. Everything looks healthy.</p>'}`;

  const text = [
    `API Monitor status report (${fmt(r.generatedAt)})`,
    `Active: ${c.active} | Critical: ${c.critical} | Warning: ${c.warning} | APIs affected: ${c.apis}`,
    `Since last report: ${r.newSince} new, ${r.resolvedSince} resolved`,
    '',
    ...(c.active ? ['Alert types:', ...Object.entries(r.byIssue).map(([k, v]) => `  ${LABEL[k] || k}: ${v}`), '', 'APIs needing attention:',
      ...r.apis.map((a) => `  ${a.name} [${a.worst}] ${a.count} alert(s)`), '', 'Latest alerts:', ...r.latest.map(alertLine)] : ['No active alerts. Everything looks healthy.']),
    '', `Dashboard: ${dashboardUrl}`,
  ].join('\n');

  const html = shell({
    title: `Status report: ${c.active ? `${c.active} active alert${c.active > 1 ? 's' : ''}` : 'all healthy'}`,
    preheader: `${c.critical} critical, ${c.warning} warning, ${c.apis} APIs affected`,
    body, dashboardUrl,
    footer: `Sent every ${s.intervalHours} hour${s.intervalHours > 1 ? 's' : ''}. Includes: ${s.severities.join(', ')} alerts; ${s.issueTypes.map((i) => LABEL[i]).join(', ')}. Change this in the dashboard (Settings &rarr; Status report).`,
  });
  return { subject, text, html };
}

function testEmail({ dashboardUrl }) {
  return {
    subject: '[API Monitor] Test email',
    text: `This is a test email from the Cottage API Monitor. Email delivery is working.\n${dashboardUrl}\n`,
    html: shell({ title: 'Test email', preheader: 'Email delivery is working',
      body: '<p style="margin:0">This is a test email from the API Monitor. Email delivery is working.</p>',
      dashboardUrl, footer: 'Sent from Settings &rarr; Send test email.' }),
  };
}

module.exports = { instantEmail, reportEmail, testEmail };
