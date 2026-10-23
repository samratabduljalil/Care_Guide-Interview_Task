// Used when the LLM is unavailable, so alerts are never lost.
module.exports = function fallbackMessage({ api_name, issues, metrics }) {
  const parts = [];
  if (issues.includes('failed_request')) parts.push(`failed with status ${metrics.status_code}`);
  if (issues.includes('high_latency')) parts.push(`responded slowly (${metrics.response_time_ms} ms)`);
  if (issues.includes('zero_records')) parts.push('returned 0 records');
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.slice(-1)}` : parts[0];
  return `${api_name} ${text}. Possible outage or data issue.`;
};
