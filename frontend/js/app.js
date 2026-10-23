const $ = (id) => document.getElementById(id);

const SAMPLE = [
  { api_name: 'PatientDataAPI', response_time_ms: 1200, status_code: 200, records_returned: 50 },
  { api_name: 'AppointmentAPI', response_time_ms: 5500, status_code: 500, records_returned: 0 },
  { api_name: 'BillingAPI', response_time_ms: 800, status_code: 200, records_returned: 0 },
  { api_name: 'LabResultsAPI', response_time_ms: 4200, status_code: 200, records_returned: 30 },
];
const LABELS = { high_latency: 'Slow response', failed_request: 'Failed request', zero_records: 'No records' };
const TITLES = { overview: 'Overview', alerts: 'Alerts', check: 'Run Check' };

const state = { alerts: [], view: 'overview', selectedId: null };

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
function renderOverview() {
  const act = active();
  const crit = act.filter((a) => a.severity === 'critical').length;
  const apis = new Set(act.map((a) => a.api_name)).size;
  const today = new Date().toDateString();
  const resolvedToday = state.alerts.filter((a) => a.status === 'resolved' && a.resolved_at && new Date(a.resolved_at).toDateString() === today).length;

  $('kpis').innerHTML = `
    <div class="kpi"><b>${act.length}</b><span>Active alerts</span></div>
    <div class="kpi crit"><b>${crit}</b><span>Critical</span></div>
    <div class="kpi warn"><b>${apis}</b><span>APIs affected</span></div>
    <div class="kpi ok"><b>${resolvedToday}</b><span>Resolved today</span></div>`;

  // group active alerts by API
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
      <div><dt>Response time</dt><dd class="${m.response_time_ms > 2000 ? 'bad' : ''}">${esc(m.response_time_ms)} ms</dd></div>
      <div><dt>HTTP status</dt><dd class="${m.status_code >= 400 ? 'bad' : ''}">${esc(m.status_code)}</dd></div>
      <div><dt>Records returned</dt><dd class="${m.records_returned < 1 ? 'bad' : ''}">${esc(m.records_returned)}</dd></div>
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

route();
load();
