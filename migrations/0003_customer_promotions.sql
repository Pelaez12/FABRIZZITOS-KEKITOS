CREATE TABLE IF NOT EXISTS promotion_subscriptions (
  company_id TEXT NOT NULL,
  id TEXT NOT NULL,
  subscription_json TEXT NOT NULL CHECK(json_valid(subscription_json)),
  auth_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  consent_version TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(company_id,id)
);
CREATE INDEX IF NOT EXISTS promotion_subscribers_active ON promotion_subscriptions(company_id,active);
CREATE TABLE IF NOT EXISTS promotion_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS promotion_previews (
  company_id TEXT NOT NULL,
  id TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  content_hash TEXT NOT NULL,
  audience_json TEXT NOT NULL CHECK(json_valid(audience_json)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(company_id,id)
);
CREATE TABLE IF NOT EXISTS promotion_campaigns (
  company_id TEXT NOT NULL,
  id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  content_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed')),
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY(company_id,id),
  UNIQUE(company_id,preview_id),
  UNIQUE(company_id,day)
);
CREATE INDEX IF NOT EXISTS promotion_campaign_month ON promotion_campaigns(company_id,month);
CREATE TABLE IF NOT EXISTS promotion_deliveries (
  company_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','expired','failed','skipped','uncertain')),
  claimed_at INTEGER,
  completed_at INTEGER,
  http_status INTEGER,
  PRIMARY KEY(company_id,campaign_id,subscriber_id),
  FOREIGN KEY(company_id,campaign_id) REFERENCES promotion_campaigns(company_id,id)
);
