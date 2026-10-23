// All backend calls live here. Same origin because Express serves this frontend.
const API_BASE = '';

async function request(path, options) {
  const res = await fetch(API_BASE + path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  getAlerts: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request('/alerts' + (qs ? '?' + qs : ''));
  },
  resolveAlert: (id) => request(`/alerts/${id}/resolve`, { method: 'PATCH' }),
  sendMonitor: (items) =>
    request('/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    }),
};
