/* Settings page: loads settings from the server, lets the team edit and save them. */
const settingsUI = (() => {
  const root = () => document.getElementById('view-settings');
  const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  const setPath = (obj, path, val) => {
    const keys = path.split('.');
    keys.slice(0, -1).reduce((o, k) => (o[k] ||= {}), obj)[keys.at(-1)] = val;
  };
  let snapshot = '';

  function fill(settings) {
    root().querySelectorAll('[data-path]').forEach((el) => {
      const v = get(settings, el.dataset.path);
      if (el.type === 'checkbox') el.checked = el.dataset.value ? (v || []).includes(el.dataset.value) : !!v;
      else if (el.dataset.list) el.value = (v || []).join('\n');
      else el.value = v ?? '';
    });
    snapshot = JSON.stringify(collect());
    markDirty();
  }

  function collect() {
    const out = {}, arrays = {};
    root().querySelectorAll('[data-path]').forEach((el) => {
      const p = el.dataset.path;
      if (el.type === 'checkbox' && el.dataset.value) {
        (arrays[p] ||= []);
        if (el.checked) arrays[p].push(el.dataset.value);
      } else if (el.type === 'checkbox') setPath(out, p, el.checked);
      else if (el.dataset.list) setPath(out, p, el.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean));
      else if (el.type === 'number') setPath(out, p, el.value === '' ? '' : Number(el.value));
      else setPath(out, p, el.value);
    });
    Object.entries(arrays).forEach(([p, v]) => setPath(out, p, v));
    return out;
  }

  const dirty = () => JSON.stringify(collect()) !== snapshot;
  function markDirty() {
    const d = dirty();
    $('savebar').classList.toggle('dirty', d);
    $('dirtyMsg').textContent = d ? 'You have unsaved changes' : 'All changes saved';
    $('saveBtn').disabled = !d;
    $('discardBtn').disabled = !d;
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : 'n/a');

  function renderMeta(data) {
    const smtp = data.smtp;
    $('smtpPill').textContent = smtp.configured ? 'Mail server connected' : 'Mail server not set up';
    $('smtpPill').className = 'pill ' + (smtp.configured ? 'ok' : 'bad');
    $('smtpNote').textContent = smtp.configured
      ? `Emails are sent from ${smtp.from}. The mail account is set in the server .env file.`
      : 'Add SMTP_HOST, SMTP_USER and SMTP_PASS to the server .env file and restart. Passwords are never stored in the dashboard.';

    const s = data.settings.email;
    $('scheduleInfo').innerHTML = !s.enabled || !s.report.enabled
      ? 'Reports are turned off.'
      : `Last report: <b>${esc(s.report.lastSentAt ? fmt(s.report.lastSentAt) : 'not yet')}</b><br>Next report: <b>${esc(fmt(data.next_report_at))}</b>`;
  }

  async function renderLog() {
    try {
      const { log } = await api.getEmailLog();
      $('emailLog').innerHTML = '<thead><tr><th>When</th><th>Type</th><th>Subject</th><th>To</th><th>Status</th></tr></thead><tbody>' +
        (log.length ? log.map((r) => `<tr>
          <td class="num">${esc(fmt(r.created_at))}</td><td>${esc(r.kind)}</td><td>${esc(r.subject)}</td>
          <td class="num">${r.recipients.length} recipient${r.recipients.length === 1 ? '' : 's'}</td>
          <td><span class="badge ${r.status === 'sent' ? 'resolved' : r.status === 'failed' ? 'critical' : 'warning'}" title="${esc(r.error || '')}">${esc(r.status)}</span></td></tr>`).join('')
          : '<tr class="empty-row"><td colspan="5">No emails sent yet.</td></tr>') + '</tbody>';
    } catch (_) { /* ignore */ }
  }

  async function refresh(updateForm = true) {
    try {
      const data = await api.getSettings();
      state.settings = data.settings;
      renderRules();
      if (updateForm) fill(data.settings);
      renderMeta(data);
    } catch (e) { if (updateForm) toast('Could not load settings: ' + e.message); }
  }

  function showErrors(list) {
    const box = $('settingsErrors');
    box.hidden = !list?.length;
    box.innerHTML = list?.length ? '<b>Please fix:</b><ul>' + list.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>' : '';
    if (list?.length) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function save() {
    $('saveBtn').disabled = true;
    try {
      const data = await api.saveSettings(collect());
      state.settings = data.settings;
      fill(data.settings); renderMeta(data); renderRules(); showErrors(null);
      toast('Settings saved');
    } catch (e) { showErrors(e.errors || [e.message]); markDirty(); }
  }

  async function action(btnId, msgId, fn, label) {
    if (dirty()) return toast('Save your changes first. This uses the saved settings.');
    const btn = $(btnId), box = $(msgId);
    btn.disabled = true; box.hidden = false; box.className = 'result'; box.textContent = label;
    try {
      const r = await fn();
      box.className = 'result' + (r.success ? '' : ' error');
      box.textContent = r.message;
    } catch (e) { box.className = 'result error'; box.textContent = e.message; }
    btn.disabled = false;
    renderLog(); refresh(false);
  }

  function init() {
    root().addEventListener('input', markDirty);
    root().addEventListener('change', markDirty);
    $('saveBtn').addEventListener('click', save);
    $('discardBtn').addEventListener('click', () => { showErrors(null); fill(state.settings); });
    $('testEmailBtn').addEventListener('click', () => action('testEmailBtn', 'emailMsg', api.testEmail, 'Sending test email...'));
    $('sendReportBtn').addEventListener('click', () => action('sendReportBtn', 'reportMsg', api.sendReport, 'Building and sending report...'));
    window.addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });
  }
  document.addEventListener('DOMContentLoaded', init);

  return { refresh, show: () => { if (!snapshot || !dirty()) refresh(true); renderLog(); } };
})();
