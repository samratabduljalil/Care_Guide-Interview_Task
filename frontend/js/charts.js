/* Tiny dependency-free chart helpers. Every function returns an HTML/SVG string. */
const charts = (() => {
  const C = { crit: '#b3261e', warn: '#e8923a', brand: '#1f6f6b', brandSoft: '#9cc9c4', grid: '#e4ecea', text: '#5e6f6d', ok: '#1f7a4d' };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Build time buckets for a range: '24h' (hourly) or '7d' (daily) */
  function buckets(range, now = new Date()) {
    const out = [];
    if (range === '24h') {
      const end = new Date(now); end.setMinutes(0, 0, 0);
      for (let i = 23; i >= 0; i--) {
        const start = new Date(end.getTime() - i * 3600e3);
        out.push({ start, end: new Date(start.getTime() + 3600e3),
          label: start.toLocaleTimeString([], { hour: 'numeric' }),
          title: start.toLocaleString([], { weekday: 'short', hour: 'numeric' }) });
      }
    } else {
      const end = new Date(now); end.setHours(0, 0, 0, 0);
      for (let i = 6; i >= 0; i--) {
        const start = new Date(end); start.setDate(end.getDate() - i);
        const next = new Date(start); next.setDate(start.getDate() + 1);
        out.push({ start, end: next,
          label: start.toLocaleDateString([], { weekday: 'short' }),
          title: start.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) });
      }
    }
    return out;
  }

  function fill(range, alerts) {
    const b = buckets(range).map((x) => ({ ...x, critical: 0, warning: 0 }));
    alerts.forEach((a) => {
      const t = new Date(a.created_at);
      const slot = b.find((x) => t >= x.start && t < x.end);
      if (slot) slot[a.severity]++;
    });
    return b;
  }

  const niceMax = (m) => { if (m <= 4) return 4; const s = Math.pow(10, Math.floor(Math.log10(m / 4))); return Math.ceil(m / 4 / s) * s * 4; };

  /* Stacked bar chart: alerts over time */
  function timeline(data) {
    const W = 680, H = 285, L = 34, R = 8, T = 10, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(0, ...data.map((d) => Math.max(d.critical + d.warning, d.resolved || 0))));
    const y = (v) => T + ih - (v / max) * ih;
    const bw = iw / data.length, bar = Math.min(26, bw * 0.62);
    const step = data.length > 12 ? 3 : 1;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${C.grid}" ${i ? 'stroke-dasharray="3 4"' : ''}/>` +
           `<text x="${L - 8}" y="${yy + 4}" text-anchor="end" class="ax">${v}</text>`;
    }
    const bars = data.map((d, i) => {
      const x = L + i * bw + (bw - bar) / 2;
      const hw = d.warning / max * ih, hc = d.critical / max * ih;
      const tip = `${d.title}|Detected critical: ${d.critical}|Detected warning: ${d.warning}|Resolved: ${d.resolved || 0}`;
      return `<g class="bar" style="--i:${i}">
        ${d.warning ? `<rect x="${x}" y="${T + ih - hw}" width="${bar}" height="${hw}" fill="${C.warn}" rx="3"/>` : ''}
        ${d.critical ? `<rect x="${x}" y="${T + ih - hw - hc}" width="${bar}" height="${hc}" fill="${C.crit}" rx="3"/>` : ''}
        <rect x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" fill="transparent" class="hit" data-tip="${esc(tip)}"/>
      </g>
      ${i % step === 0 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(d.label)}</text>` : ''}`;
    }).join('');
    // green line = alerts resolved in each period (by the time they were resolved)
    const pts = data.map((d, i) => [L + i * bw + bw / 2, y(d.resolved || 0)]);
    const line = data.some((d) => d.resolved)
      ? `<g class="res-line" pointer-events="none"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${C.ok}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
        pts.map((p, i) => (data[i].resolved ? `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${C.ok}" stroke="#fff" stroke-width="1.5"/>` : '')).join('') + '</g>'
      : '';
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Alerts detected by severity, and alerts resolved, over time">${g}${bars}${line}</svg>`;
  }

  /* Donut chart: [{label, value, color}] */
  function donut(parts, centerTop, centerBottom) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    const r = 62, circ = 2 * Math.PI * r;
    let off = 0, segs = '';
    if (total === 0) segs = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${C.grid}" stroke-width="22"/>`;
    parts.filter((p) => p.value > 0).forEach((p) => {
      const len = (p.value / total) * circ;
      segs += `<circle class="seg" cx="90" cy="90" r="${r}" fill="none" stroke="${p.color}" stroke-width="22"
        stroke-dasharray="${Math.max(0, len - 2)} ${circ}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"
        data-tip="${esc(p.label + ': ' + p.value)}"/>`;
      off += len;
    });
    return `<svg viewBox="0 0 180 180" role="img" aria-label="${esc(centerBottom)}: ${total}">${segs}
      <text x="90" y="92" text-anchor="middle" class="dn-num">${esc(centerTop)}</text>
      <text x="90" y="112" text-anchor="middle" class="ax">${esc(centerBottom)}</text></svg>`;
  }

  /* Horizontal bars (HTML). items: [{label, segs:[{value,color,name}], total}] */
  function hbars(items, emptyText) {
    if (!items.length) return `<p class="chart-empty">${esc(emptyText)}</p>`;
    const max = Math.max(...items.map((i) => i.total));
    return `<ul class="hbars">${items.map((it, n) => `
      <li style="--i:${n}">
        <span class="hb-label" title="${esc(it.label)}">${esc(it.label)}</span>
        <span class="hb-track">${it.segs.filter((s) => s.value).map((s) =>
          `<span class="hb-fill" style="width:${(s.value / max) * 100}%;background:${s.color}" data-tip="${esc(it.label + ' · ' + s.name + ': ' + s.value)}"></span>`).join('')}</span>
        <span class="hb-val">${it.total}</span>
      </li>`).join('')}</ul>`;
  }

  /* Sparkline: array of numbers */
  function spark(values, color) {
    const W = 100, H = 32, max = Math.max(1, ...values);
    const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : 0, H - 3 - (v / max) * (H - 8)]);
    const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,${H} ${line} ${W},${H}" fill="${color}" opacity=".12"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* Shared tooltip (one element, event delegation) */
  function initTooltip() {
    const tip = document.createElement('div');
    tip.className = 'tooltip'; tip.hidden = true; document.body.appendChild(tip);
    const show = (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) { tip.hidden = true; return; }
      const [head, ...rest] = el.dataset.tip.split('|');
      tip.innerHTML = `<b>${esc(head)}</b>${rest.map((r) => `<span>${esc(r)}</span>`).join('')}`;
      tip.hidden = false;
      const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + pad, yy = e.clientY + pad;
      if (x + w > innerWidth - 8) x = e.clientX - w - pad;
      if (yy + h > innerHeight - 8) yy = e.clientY - h - pad;
      tip.style.left = x + 'px'; tip.style.top = yy + 'px';
    };
    document.addEventListener('mousemove', show);
    document.addEventListener('mouseleave', () => (tip.hidden = true));
    document.addEventListener('scroll', () => (tip.hidden = true), true);
  }

  return { C, fill, timeline, donut, hbars, spark, initTooltip };
})();
