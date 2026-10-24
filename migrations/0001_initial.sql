PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup', 'delivery')),
  address TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  booking_date TEXT NOT NULL,
  booking_time TEXT NOT NULL,
  slot_at TEXT NOT NULL,
  keke_qty INTEGER NOT NULL CHECK (keke_qty BETWEEN 0 AND 15),
  shake_qty INTEGER NOT NULL CHECK (shake_qty BETWEEN 0 AND 99),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  reservation_status TEXT NOT NULL DEFAULT 'reserved' CHECK (reservation_status IN ('reserved', 'cancelled', 'fulfilled')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'pending_review', 'approved', 'rejected')),
  receipt_key TEXT,
  receipt_mime TEXT,
  receipt_sha256 TEXT,
  notice_accepted INTEGER NOT NULL CHECK (notice_accepted = 1),
  created_at TEXT NOT NULL,
  CHECK (keke_qty + shake_qty > 0),
  CHECK (fulfillment <> 'delivery' OR (shake_qty = 0 AND district = 'Jesús María'))
);

CREATE INDEX IF NOT EXISTS reservations_date_status ON reservations (booking_date, reservation_status);

-- Outbox for the existing admin panel. No delivery or admin connection yet.
CREATE TABLE IF NOT EXISTS admin_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('reservation.created', 'payment.review_requested')),
  title TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered')),
  created_at TEXT NOT NULL,
  UNIQUE (reservation_id, event_type)
);
