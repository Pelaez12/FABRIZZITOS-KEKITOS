PRAGMA foreign_keys=OFF;
CREATE TABLE reservations_new (
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
  gelatin_qty INTEGER NOT NULL DEFAULT 0 CHECK (gelatin_qty BETWEEN 0 AND 99),
  kefir_qty INTEGER NOT NULL DEFAULT 0 CHECK (kefir_qty BETWEEN 0 AND 99),
  water_qty INTEGER NOT NULL DEFAULT 0 CHECK (water_qty BETWEEN 0 AND 99),
  gatorade_qty INTEGER NOT NULL DEFAULT 0 CHECK (gatorade_qty BETWEEN 0 AND 99),
  CHECK (keke_qty + shake_qty + gelatin_qty + kefir_qty + water_qty + gatorade_qty > 0),
  CHECK (fulfillment <> 'delivery' OR (shake_qty = 0 AND gelatin_qty = 0 AND kefir_qty = 0 AND water_qty = 0 AND gatorade_qty = 0 AND district = 'Jesús María'))
);
INSERT INTO reservations_new (id,reference,request_key,payload_hash,customer_name,phone,fulfillment,address,district,booking_date,booking_time,slot_at,keke_qty,shake_qty,total_cents,reservation_status,payment_status,receipt_key,receipt_mime,receipt_sha256,notice_accepted,created_at,gelatin_qty,kefir_qty,water_qty,gatorade_qty)
  SELECT id,reference,request_key,payload_hash,customer_name,phone,fulfillment,address,district,booking_date,booking_time,slot_at,keke_qty,shake_qty,total_cents,reservation_status,payment_status,receipt_key,receipt_mime,receipt_sha256,notice_accepted,created_at,gelatin_qty,kefir_qty,water_qty,gatorade_qty FROM reservations;
DROP TABLE reservations;
ALTER TABLE reservations_new RENAME TO reservations;
CREATE INDEX IF NOT EXISTS reservations_date_status ON reservations (booking_date, reservation_status);
CREATE INDEX IF NOT EXISTS reservations_products_date ON reservations (booking_date, gelatin_qty, kefir_qty);
CREATE INDEX IF NOT EXISTS reservations_hydration_date ON reservations (booking_date, water_qty, gatorade_qty);
PRAGMA foreign_keys=ON;
