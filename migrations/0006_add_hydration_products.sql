ALTER TABLE reservations ADD COLUMN water_qty INTEGER NOT NULL DEFAULT 0 CHECK (water_qty BETWEEN 0 AND 99);
ALTER TABLE reservations ADD COLUMN gatorade_qty INTEGER NOT NULL DEFAULT 0 CHECK (gatorade_qty BETWEEN 0 AND 99);
CREATE INDEX IF NOT EXISTS reservations_hydration_date ON reservations (booking_date, water_qty, gatorade_qty);
