const $ = (id) => document.getElementById(id);

const SAMPLE = [
  { api_name: 'PatientDataAPI', response_time_ms: 1200, status_code: 200, records_returned: 50 },
  { api_name: 'AppointmentAPI', response_time_ms: 5500, status_code: 500, records_returned: 0 },
  { api_name: 'BillingAPI', response_time_ms: 800, status_code: 200, records_returned: 0 },
  { api_name: 'LabResultsAPI', response_time_ms: 4200, status_code: 200, records_returned: 30 },
];
const LABELS = { high_latency: 'Slow response', failed_request: 'Failed request', zero_records: 'No records' };
const TITLES = { overview: 'Overview', alerts: 'Alerts', check: 'Run Check', settings: 'Settings' };

const state = { alerts: [], view: 'overview', selectedId: null, range: '24h', intro: true, settings: null };

/* ---------- helpers ---------- */
function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

function ago(iso) {
  const sec = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}
const full = (iso) => new Date(iso).toLocaleString();

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

const sevBadge = (a) =>
  a.status === 'resolved' ? '<span class="badge resolved">Resolved</span>' : `<span class="badge ${esc(a.severity)}">${esc(a.severity)}</span>`;
const tags = (a) => a.issues.map((i) => `<span class="tag">${esc(LABELS[i] || i)}</span>`).join('');

/* ---------- thresholds (from Settings) ---------- */
const th = () => state.settings?.thresholds || { latencyWarningMs: 2000, latencyCriticalMs: 4000, errorStatusFrom: 400, criticalStatusFrom: 500, minRecords: 1 };

function renderRules() {
  const t = th();
  $('rulesList').innerHTML = `
    <li><span class="tag">Slow response</span> Response time above ${t.latencyWarningMs} ms (critical above ${t.latencyCriticalMs} ms)</li>
    <li><span class="tag">Failed request</span> HTTP status ${t.errorStatusFrom} or higher (critical from ${t.criticalStatusFrom})</li>
    <li><span class="tag">No records</span> ${t.minRecords > 0 ? `Fewer than ${t.minRecords} record${t.minRecords > 1 ? 's' : ''} returned` : 'Check is turned off'}</li>`;
}

/* ---------- data ---------- */
async function load() {
  try {
    const { alerts } = await api.getAlerts({ status: 'all' });
    state.alerts = alerts;
    setConn(true);
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    setConn(false);
    $('updated').textContent = 'Update failed';
  }
  render();
}

function setConn(ok) {
  $('connDot').className = 'dot ' + (ok ? 'ok' : 'bad');
  $('connText').textContent = ok ? 'Server connected' : 'Server unreachable';
}

const active = () => state.alerts.filter((a) => a.status === 'active');

/* ---------- overview ---------- */
function inRange(a) {
  const ms = state.range === '24h' ? 24 * 3600e3 : 7 * 86400e3;
  return Date.now() - new Date(a.created_at) <= ms;
}

function renderOverview() {
  const act = active();
  const crit = act.filter((a) => a.severity === 'critical').length;
  const warn = act.length - crit;
  const apis = new Set(act.map((a) => a.api_name)).size;
  const today = new Date().toDateString();
  const resolvedToday = state.alerts.filter((a) => a.status === 'resolved' && a.resolved_at && new Date(a.resolved_at).toDateString() === today).length;
  const label = state.range === '24h' ? 'last 24 hours' : 'last 7 days';
  const ranged = state.alerts.filter(inRange);
  const series = charts.fill(state.range, ranged);
  const C = charts.C;
  // real resolved-per-bucket counts, based on when each alert was resolved
  const resolvedSeries = charts.fill(state.range,
    state.alerts.filter((a) => a.status === 'resolved' && a.resolved_at).map((a) => ({ created_at: a.resolved_at, severity: 'warning' }))
  ).map((d) => d.warning);

  $('ovSub').textContent = act.length
    ? `${act.length} active alert${act.length > 1 ? 's' : ''} across ${apis} API${apis > 1 ? 's' : ''}`
    : 'All monitored APIs are healthy';

  /* KPI cards with sparklines */
  const kpi = (cls, value, name, note, vals, color) =>
    `<div class="kpi ${cls}"><div><b>${value}</b><span>${name}</span><small>${note}</small></div>${charts.spark(vals, color)}</div>`;
  $('kpis').innerHTML =
    kpi('', act.length, 'Active alerts', `${ranged.length} new in ${label}`, series.map((d) => d.critical + d.warning), C.brand) +
    kpi('crit', crit, 'Critical', `${warn} warning`, series.map((d) => d.critical), C.crit) +
    kpi('warn', apis, 'APIs affected', apis ? 'need a look' : 'all healthy', series.map((d) => d.critical + d.warning), C.warn) +
    kpi('ok', resolvedToday, 'Resolved today', `${state.alerts.filter((a) => a.status === 'resolved').length} resolved in total`,
      resolvedSeries, C.ok);

  /* Charts */
  $('chartTimeline').innerHTML = charts.timeline(series);
  $('chartDonut').innerHTML = charts.donut(
    [{ label: 'Critical', value: crit, color: C.crit }, { label: 'Warning', value: warn, color: C.warn }], String(act.length), 'active');
  $('donutLegend').innerHTML =
    `<li><i style="background:${C.crit}"></i>Critical <b>${crit}</b></li><li><i style="background:${C.warn}"></i>Warning <b>${warn}</b></li>` +
    `<li><i style="background:${C.ok}"></i>Resolved <b>${state.alerts.length - act.length}</b></li>`;

  $('rangeLabel1').textContent = $('rangeLabel2').textContent = label;

  const issueCount = { high_latency: 0, failed_request: 0, zero_records: 0 };
  ranged.forEach((a) => a.issues.forEach((i) => { issueCount[i] = (issueCount[i] || 0) + 1; }));
  const issueColors = { high_latency: C.warn, failed_request: C.crit, zero_records: C.brand };
  $('chartIssues').innerHTML = charts.hbars(
    Object.entries(issueCount).sort((x, y) => y[1] - x[1]).filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: LABELS[k] || k, total: v, segs: [{ value: v, color: issueColors[k] || C.brand, name: 'alerts' }] })),
    `No alerts in the ${label}.`);

  const perApi = {};
  ranged.forEach((a) => { const o = (perApi[a.api_name] ||= { critical: 0, warning: 0 }); o[a.severity]++; });
  $('chartApis').innerHTML = charts.hbars(
    Object.entries(perApi).map(([name, o]) => ({ label: name, total: o.critical + o.warning,
      segs: [{ value: o.critical, color: C.crit, name: 'critical' }, { value: o.warning, color: C.warn, name: 'warning' }] }))
      .sort((x, y) => y.total - x.total).slice(0, 6),
    `No alerts in the ${label}.`);

  /* API cards */
  const byApi = {};
  act.forEach((a) => { (byApi[a.api_name] ||= []).push(a); });
  const groups = Object.entries(byApi).sort((x, y) =>
    (y[1].some((a) => a.severity === 'critical') - x[1].some((a) => a.severity === 'critical')) || y[1].length - x[1].length);

  $('apiSub').textContent = groups.length ? `${groups.length} with active alerts` : '';
  $('apiGrid').innerHTML = groups.length
    ? groups.map(([name, list]) => {
        const worst = list.some((a) => a.severity === 'critical') ? 'critical' : 'warning';
        return `<button class="api-card ${worst}" data-api="${esc(name)}">
          <h3>${esc(name)} <span class="badge ${worst}">${worst}</span></h3>
          <p>${esc(list[0].message)}</p>
          <small>${list.length} active alert${list.length > 1 ? 's' : ''} · latest ${ago(list[0].created_at)}</small>
        </button>`;
      }).join('')
    : '<div class="all-clear" style="grid-column:1/-1">All monitored APIs are healthy. No active alerts.</div>';

  $('latestTable').innerHTML = tableHTML(state.alerts.slice(0, 6), false);

  // play the grow-in animation only on the first render, not on every refresh
  document.body.classList.toggle('intro', state.intro);
  state.intro = false;
}

/* ---------- alerts table ---------- */
function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const sev = $('fSeverity').value, st = $('fStatus').value, apiName = $('fApi').value;
  return state.alerts.filter((a) =>
    (!sev || a.severity === sev) && (st === 'all' || a.status === st) && (!apiName || a.api_name === apiName) &&
    (!q || a.api_name.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)));
}

function tableHTML(rows, withAction = true) {
  const head = `<thead><tr><th>Severity</th><th>API</th><th>Issues</th><th>Message</th><th>Response</th><th>Detected</th>${withAction ? '<th></th>' : ''}</tr></thead>`;
  if (!rows.length) return head + `<tbody><tr class="empty-row"><td colspan="${withAction ? 7 : 6}">No alerts to show.</td></tr></tbody>`;
  return head + '<tbody>' + rows.map((a) => `
    <tr data-id="${esc(a.id)}">
      <td data-label="Severity">${sevBadge(a)}</td>
      <td class="api" data-label="API">${esc(a.api_name)}</td>
      <td data-label="Issues">${tags(a)}</td>
      <td class="msg" data-label="Message">${esc(a.message)}</td>
      <td class="num" data-label="Response">${esc(a.metrics.response_time_ms)} ms<br>HTTP ${esc(a.metrics.status_code)} · ${esc(a.metrics.records_returned)} rec</td>
      <td class="num" data-label="Detected" title="${esc(full(a.created_at))}">${ago(a.created_at)}</td>
      ${withAction ? `<td>${a.status === 'active' ? `<button class="btn btn-outline btn-sm" data-resolve="${esc(a.id)}">Resolve</button>` : ''}</td>` : ''}
    </tr>`).join('') + '</tbody>';
}

function renderAlerts() {
  const sel = $('fApi'), cur = sel.value;
  const names = [...new Set(state.alerts.map((a) => a.api_name))].sort();
  sel.innerHTML = '<option value="">All APIs</option>' + names.map((n) => `<option>${esc(n)}</option>`).join('');
  sel.value = names.includes(cur) ? cur : '';

  const rows = filtered();
  $('alertsTable').innerHTML = tableHTML(rows);
  $('tableFoot').textContent = `Showing ${rows.length} of ${state.alerts.length} alerts`;
}

/* ---------- drawer ---------- */
function openDrawer(id) {
  const a = state.alerts.find((x) => String(x.id) === String(id));
  if (!a) return;
  state.selectedId = a.id;
  const m = a.metrics;
  $('drawerBody').innerHTML = `
    <div>
      <h3>${esc(a.api_name)}</h3>
      ${sevBadge(a)} ${tags(a)}
    </div>
    <div class="callout">${esc(a.message)}<small>${a.ai_generated ? 'Written by AI (Gemini)' : 'Template message (AI not used)'}</small></div>
    <dl class="dl">
      <div><dt>Response time</dt><dd class="${m.response_time_ms > th().latencyWarningMs ? 'bad' : ''}">${esc(m.response_time_ms)} ms</dd></div>
      <div><dt>HTTP status</dt><dd class="${m.status_code >= th().errorStatusFrom ? 'bad' : ''}">${esc(m.status_code)}</dd></div>
      <div><dt>Records returned</dt><dd class="${m.records_returned < th().minRecords ? 'bad' : ''}">${esc(m.records_returned)}</dd></div>
      <div><dt>Alert ID</dt><dd>#${esc(a.id)}</dd></div>
    </dl>
    <div class="timeline">
      <span>Detected: ${esc(full(a.created_at))} (${ago(a.created_at)})</span>
      ${a.resolved_at ? `<span>Resolved: ${esc(full(a.resolved_at))}</span>` : ''}
    </div>
    ${a.status === 'active' ? `<button class="btn btn-primary" data-resolve="${esc(a.id)}">Mark as resolved</button>` : ''}`;
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }

async function resolve(id) {
  try { await api.resolveAlert(id); toast('Alert marked as resolved'); closeDrawer(); await load(); }
  catch (e) { toast('Could not resolve: ' + e.message); }
}

/* ---------- views / routing ---------- */
function render() {
  const act = active().length;
  $('navCount').textContent = act;
  $('navCount').classList.toggle('zero', act === 0);
  renderOverview();
  renderAlerts();
}

function showView(name) {
  if (!TITLES[name]) name = 'overview';
  state.view = name;
  Object.keys(TITLES).forEach((v) => ($('view-' + v).hidden = v !== name));
  document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  $('pageTitle').textContent = TITLES[name];
  document.title = `${TITLES[name]} | API Monitor | Cottage Home Care`;
  if (name === 'settings') settingsUI.show();
  closeMenu();
}
const route = () => showView(location.hash.slice(1));
window.addEventListener('hashchange', route);

/* ---------- mobile menu ---------- */
function closeMenu() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show'); }
$('menuBtn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('scrim').classList.add('show'); });
$('scrim').addEventListener('click', closeMenu);

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-resolve]');
  if (r) { e.stopPropagation(); resolve(r.dataset.resolve); return; }
  const row = e.target.closest('tr[data-id]');
  if (row) return openDrawer(row.dataset.id);
  const card = e.target.closest('[data-api]');
  if (card) { $('fApi').value = card.dataset.api; $('fStatus').value = 'active'; renderAlerts(); location.hash = '#alerts'; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
$('drawerClose').addEventListener('click', closeDrawer);

['q', 'fSeverity', 'fStatus', 'fApi'].forEach((id) => $(id).addEventListener('input', renderAlerts));
document.querySelectorAll('.seg-btn').forEach((btn) => btn.addEventListener('click', () => {
  state.range = btn.dataset.range;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b === btn));
  renderOverview();
}));
$('refresh').addEventListener('click', () => { load(); toast('Refreshed'); });

let timer = setInterval(load, 15000);
$('auto').addEventListener('change', (e) => {
  clearInterval(timer);
  if (e.target.checked) timer = setInterval(load, 15000);
});

$('export').addEventListener('click', () => {
  const rows = filtered();
  const csv = [['id', 'api_name', 'severity', 'status', 'issues', 'message', 'response_time_ms', 'status_code', 'records_returned', 'created_at']]
    .concat(rows.map((a) => [a.id, a.api_name, a.severity, a.status, a.issues.join('|'), a.message,
      a.metrics.response_time_ms, a.metrics.status_code, a.metrics.records_returned, a.created_at]))
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'alerts.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});

/* ---------- run check ---------- */
const resetSample = () => { $('payload').value = JSON.stringify(SAMPLE, null, 2); };
resetSample();
$('reset').addEventListener('click', resetSample);
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) $('payload').value = await f.text();
  e.target.value = '';
});

$('send').addEventListener('click', async () => {
  const box = $('result'), btn = $('send');
  box.hidden = false; box.className = 'result';
  try {
    const items = JSON.parse($('payload').value);
    btn.disabled = true; box.textContent = 'Running check...';
    const r = await api.sendMonitor(items);
    const rej = r.rejected_indexes.length ? ` ${r.rejected_indexes.length} invalid item(s) skipped (positions: ${r.rejected_indexes.join(', ')}).` : '';
    box.textContent = `Checked ${r.total_processed} of ${r.total_received} API results and found ${r.anomalies_found} problem(s).${rej}`;
    await load();
  } catch (err) {
    box.className = 'result error';
    box.textContent = err instanceof SyntaxError ? 'That is not valid JSON. Check commas and brackets.' : err.message;
  } finally { btn.disabled = false; }
});

/* ---------- logo fallback ---------- */
function showTextLogo() { $('logo').hidden = true; $('logoText').hidden = false; }
$('logo').addEventListener('error', showTextLogo);
if ($('logo').complete && $('logo').naturalWidth === 0) showTextLogo();

charts.initTooltip();
renderRules();
settingsUI.refresh(false);
route();
load();
