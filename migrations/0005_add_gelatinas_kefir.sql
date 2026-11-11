ALTER TABLE reservations ADD COLUMN gelatin_qty INTEGER NOT NULL DEFAULT 0 CHECK (gelatin_qty BETWEEN 0 AND 99);
ALTER TABLE reservations ADD COLUMN kefir_qty INTEGER NOT NULL DEFAULT 0 CHECK (kefir_qty BETWEEN 0 AND 99);
CREATE INDEX IF NOT EXISTS reservations_products_date ON reservations (booking_date, gelatin_qty, kefir_qty);
