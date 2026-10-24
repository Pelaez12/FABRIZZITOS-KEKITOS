CREATE TABLE IF NOT EXISTS flexqr_outbox (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'retry', 'sent', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  last_http_status INTEGER,
  last_error_code TEXT,
  panel_id TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS flexqr_outbox_due ON flexqr_outbox(status, next_attempt_at);
