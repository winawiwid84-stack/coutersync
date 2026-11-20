-- CourtSync (MainBareng Bandung) — PostgreSQL Relational Schema
-- Enforces strict anti-double-booking at the database engine level via UNIQUE constraint on booking_slots.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Venues (GOR Mitra Bandung + Dynamic Pricing Off-Peak)
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sport VARCHAR(32) NOT NULL CHECK (sport IN ('Badminton', 'Futsal', 'Mini Soccer', 'Padel')),
  area VARCHAR(80) NOT NULL,
  address TEXT NOT NULL,
  rating NUMERIC(2, 1) NOT NULL DEFAULT 4.8,
  review_count INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL,
  open_hour SMALLINT NOT NULL DEFAULT 8 CHECK (open_hour BETWEEN 0 AND 23),
  close_hour SMALLINT NOT NULL DEFAULT 22 CHECK (close_hour BETWEEN 1 AND 24),
  facilities TEXT[] NOT NULL DEFAULT '{}',
  bank_account VARCHAR(160) NOT NULL,
  pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pricing_days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  pricing_start_hour SMALLINT NOT NULL DEFAULT 9,
  pricing_end_hour SMALLINT NOT NULL DEFAULT 15,
  pricing_discount_percent SMALLINT NOT NULL DEFAULT 20 CHECK (pricing_discount_percent BETWEEN 0 AND 80),
  pricing_label VARCHAR(80) NOT NULL DEFAULT 'Promo Off-Peak Siang',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Courts (Lapangan per GOR)
CREATE TABLE IF NOT EXISTS courts (
  id VARCHAR(64) PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  surface VARCHAR(100) NOT NULL,
  indoor BOOLEAN NOT NULL DEFAULT TRUE,
  base_price_per_hour INTEGER NOT NULL CHECK (base_price_per_hour > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courts_venue_id ON courts(venue_id);

-- 3. Bookings (Header Transaksi Booking Online, Walk-In, Member)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(32) NOT NULL UNIQUE,
  venue_id VARCHAR(64) NOT NULL REFERENCES venues(id),
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id),
  booking_date DATE NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(32) NOT NULL,
  owner_uid VARCHAR(128),
  source VARCHAR(16) NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'member', 'walkin')),
  payment_method VARCHAR(24) NOT NULL DEFAULT 'QRIS' CHECK (payment_method IN ('QRIS', 'VA_BCA', 'VA_MANDIRI', 'VA_BNI', 'KASIR_TUNAI')),
  payment_mode VARCHAR(16) NOT NULL DEFAULT 'full' CHECK (payment_mode IN ('full', 'split')),
  total_price INTEGER NOT NULL CHECK (total_price >= 0),
  discount_applied INTEGER NOT NULL DEFAULT 0 CHECK (discount_applied >= 0),
  split_link TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_split', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_venue_date ON bookings(venue_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);

-- 4. Booking Slots (Atomic Anti-Double-Booking Lock Table)
-- CRITICAL CONSTRAINT: UNIQUE (court_id, booking_date, slot_hour) guarantees at PostgreSQL level
-- that two concurrent transactions can NEVER book the same court at the same date & hour.
CREATE TABLE IF NOT EXISTS booking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  venue_id VARCHAR(64) NOT NULL REFERENCES venues(id),
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id),
  booking_date DATE NOT NULL,
  slot_hour SMALLINT NOT NULL CHECK (slot_hour BETWEEN 8 AND 21),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_booking_slots_no_double_booking UNIQUE (court_id, booking_date, slot_hour)
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_lookup ON booking_slots(venue_id, booking_date, court_id);

-- 5. Booking Participants (Split Bill / Patungan Real-Time Status Tracker)
CREATE TABLE IF NOT EXISTS booking_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_gateway VARCHAR(24),
  gateway_order_id VARCHAR(128) UNIQUE,
  gateway_transaction_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_participants_booking ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_order ON booking_participants(gateway_order_id);
