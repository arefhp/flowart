-- Milestone 2: workshops / events. The bookings tables are created now (the admin calendar shows
-- booking counts and capacity rules need them) but the booking and payment flow arrives in
-- Milestone 3. Conventions as before: TEXT UUIDs, ISO-8601 UTC TEXT timestamps, INTEGER money.

CREATE TABLE events (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  title_da         TEXT CHECK (title_da IS NULL OR length(title_da) <= 200),
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT CHECK (description IS NULL OR length(description) <= 5000),
  description_da   TEXT CHECK (description_da IS NULL OR length(description_da) <= 5000),
  -- The moment of the event as UTC instants. The admin types local time in `timezone`; the API
  -- converts. There are NO separate date/time/zone columns that could disagree.
  starts_at        TEXT NOT NULL,
  ends_at          TEXT NOT NULL,
  timezone         TEXT NOT NULL DEFAULT 'Europe/Copenhagen',
  location         TEXT CHECK (location IS NULL OR length(location) <= 200),
  location_da      TEXT CHECK (location_da IS NULL OR length(location_da) <= 200),
  max_participants INTEGER NOT NULL CHECK (max_participants > 0),
  -- price per person in minor units; 0 = free. (Unlike artworks, an event always has a price.)
  price_minor      INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency         TEXT NOT NULL DEFAULT 'DKK' CHECK (length(currency) = 3),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  -- ISO-8601 UTC strings of identical format compare correctly as text
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_events_status_start ON events (status, starts_at);

CREATE TRIGGER events_updated_at AFTER UPDATE ON events
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TABLE event_bookings (
  id                          TEXT PRIMARY KEY,
  event_id                    TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  public_token                TEXT NOT NULL UNIQUE,
  customer_name               TEXT NOT NULL,
  customer_email              TEXT NOT NULL,
  customer_phone              TEXT,
  locale                      TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'da')),
  number_of_participants      INTEGER NOT NULL CHECK (number_of_participants > 0),
  amount_minor                INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency                    TEXT NOT NULL,
  stripe_checkout_session_id  TEXT UNIQUE,
  stripe_payment_intent_id    TEXT,
  payment_status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  booking_status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  needs_attention             INTEGER NOT NULL DEFAULT 0 CHECK (needs_attention IN (0, 1)),
  hold_expires_at             TEXT,
  consent_accepted_at         TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);
CREATE INDEX idx_event_bookings_event_status ON event_bookings (event_id, booking_status);
CREATE INDEX idx_event_bookings_hold ON event_bookings (hold_expires_at);

CREATE TRIGGER event_bookings_updated_at AFTER UPDATE ON event_bookings
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE event_bookings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- Stripe event ids already handled (webhook idempotency, Milestone 3)
CREATE TABLE stripe_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  processed_at  TEXT NOT NULL
);
