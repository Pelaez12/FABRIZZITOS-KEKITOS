CREATE TABLE IF NOT EXISTS customer_accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customer_accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_session_expiry ON customer_sessions(expires_at);
CREATE TABLE IF NOT EXISTS customer_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_auth_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_orders (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id),
  user_id TEXT NOT NULL REFERENCES customer_accounts(id)
);
CREATE INDEX IF NOT EXISTS customer_orders_user ON customer_orders(user_id);
CREATE TABLE IF NOT EXISTS customer_push_links (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customer_accounts(id),
  linked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_mission_claims (
  user_id TEXT NOT NULL REFERENCES customer_accounts(id),
  mission_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,mission_id)
);
CREATE TABLE IF NOT EXISTS customer_wheel_spins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customer_accounts(id),
  request_key TEXT NOT NULL,
  spin_number INTEGER NOT NULL,
  prize_id TEXT NOT NULL,
  prize_label TEXT NOT NULL,
  discount_cents INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  UNIQUE(user_id,request_key),
  UNIQUE(user_id,spin_number)
);
CREATE TABLE IF NOT EXISTS customer_review_events (
  event_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  payload_hash TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  reservation_status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
