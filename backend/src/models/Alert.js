const createTableSQL = `
CREATE TABLE IF NOT EXISTS alerts (
  id               SERIAL PRIMARY KEY,
  api_name         TEXT        NOT NULL,
  issues           TEXT[]      NOT NULL,
  severity         TEXT        NOT NULL CHECK (severity IN ('warning', 'critical')),
  message          TEXT        NOT NULL,
  ai_generated     BOOLEAN     NOT NULL DEFAULT FALSE,
  response_time_ms DOUBLE PRECISION,
  status_code      INTEGER,
  records_returned INTEGER,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_api_name ON alerts (api_name);
`;

// Converts a DB row into the JSON shape the API/frontend uses.
function toAlert(row) {
  return {
    id: row.id,
    api_name: row.api_name,
    issues: row.issues,
    severity: row.severity,
    message: row.message,
    ai_generated: row.ai_generated,
    metrics: {
      response_time_ms: row.response_time_ms,
      status_code: row.status_code,
      records_returned: row.records_returned,
    },
    status: row.status,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
  };
}

module.exports = { createTableSQL, toAlert };
