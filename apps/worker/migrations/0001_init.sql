-- Milestone 1: gallery, About page, social links, contact messages, email outbox,
-- audit log, rate limits and site state. Events and bookings arrive in later migrations.
-- Conventions (spec section 4): TEXT UUID ids, TEXT ISO-8601 UTC timestamps,
-- INTEGER 0/1 booleans, INTEGER minor units for money.

CREATE TABLE artworks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  title_da        TEXT CHECK (title_da IS NULL OR length(title_da) <= 200),
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT CHECK (description IS NULL OR length(description) <= 5000),
  description_da  TEXT CHECK (description_da IS NULL OR length(description_da) <= 5000),
  -- NULL price = no price specified (never shown). 0 = genuinely free.
  price_minor     INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency        TEXT CHECK (currency IS NULL OR length(currency) = 3),
  width_cm        REAL CHECK (width_cm IS NULL OR width_cm > 0),
  height_cm       REAL CHECK (height_cm IS NULL OR height_cm > 0),
  depth_cm        REAL CHECK (depth_cm IS NULL OR depth_cm > 0),
  medium          TEXT CHECK (medium IS NULL OR length(medium) <= 200),
  medium_da       TEXT CHECK (medium_da IS NULL OR length(medium_da) <= 200),
  year            INTEGER CHECK (year IS NULL OR year BETWEEN 1000 AND 3000),
  status          TEXT NOT NULL DEFAULT 'hidden'
                  CHECK (status IN ('available', 'sold', 'reserved', 'hidden')),
  featured        INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  cover_image_id  TEXT REFERENCES artwork_images (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  -- currency is required if and only if a price is set
  CHECK ((price_minor IS NULL) = (currency IS NULL))
);
CREATE INDEX idx_artworks_status ON artworks (status);

CREATE TABLE artwork_images (
  id               TEXT PRIMARY KEY,
  artwork_id       TEXT NOT NULL REFERENCES artworks (id) ON DELETE CASCADE,
  -- e.g. artworks/{artwork_id}/{uuid}; variants are {base}-480.webp, -960.webp, -1920.webp
  object_key_base  TEXT NOT NULL UNIQUE,
  alt_text         TEXT NOT NULL DEFAULT '' CHECK (length(alt_text) <= 300),
  alt_text_da      TEXT CHECK (alt_text_da IS NULL OR length(alt_text_da) <= 300),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  width            INTEGER NOT NULL CHECK (width > 0),
  height           INTEGER NOT NULL CHECK (height > 0),
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_artwork_images_artwork ON artwork_images (artwork_id, sort_order);

-- Singleton About page (spec 4A). Danish fields are optional and fall back to English.
CREATE TABLE about_page (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  heading            TEXT CHECK (heading IS NULL OR length(heading) <= 200),
  heading_da         TEXT CHECK (heading_da IS NULL OR length(heading_da) <= 200),
  body               TEXT NOT NULL CHECK (length(body) <= 5000),
  body_da            TEXT CHECK (body_da IS NULL OR length(body_da) <= 5000),
  portrait_key_base  TEXT,
  portrait_alt       TEXT CHECK (portrait_alt IS NULL OR length(portrait_alt) <= 300),
  portrait_alt_da    TEXT CHECK (portrait_alt_da IS NULL OR length(portrait_alt_da) <= 300),
  portrait_width     INTEGER,
  portrait_height    INTEGER,
  updated_at         TEXT NOT NULL,
  -- a portrait needs its size and alt text
  CHECK (portrait_key_base IS NULL
         OR (portrait_width IS NOT NULL AND portrait_height IS NOT NULL
             AND portrait_alt IS NOT NULL AND length(trim(portrait_alt)) > 0))
);

-- Social links (spec 4B)
CREATE TABLE social_links (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL
              CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube',
                                  'pinterest', 'x', 'behance', 'other')),
  url         TEXT NOT NULL CHECK (length(url) <= 500),
  label       TEXT CHECK (label IS NULL OR length(label) <= 60),
  visible     INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  sort_order  INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (platform <> 'other' OR (label IS NOT NULL AND length(trim(label)) > 0))
);

CREATE TABLE contact_messages (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email       TEXT NOT NULL CHECK (length(email) <= 254),
  message     TEXT NOT NULL CHECK (length(message) <= 5000),
  locale      TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'da')),
  artwork_id  TEXT REFERENCES artworks (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_contact_messages_created ON contact_messages (created_at);

-- Outgoing mail with retry state. Payment/contact flows never block on delivery.
CREATE TABLE email_outbox (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL,
  to_email         TEXT NOT NULL,
  reply_to         TEXT,
  subject          TEXT NOT NULL,
  text_body        TEXT NOT NULL,
  html_body        TEXT,
  locale           TEXT NOT NULL DEFAULT 'en',
  attachments_json TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT NOT NULL,
  last_error       TEXT,
  created_at       TEXT NOT NULL,
  sent_at          TEXT
);
CREATE INDEX idx_email_outbox_due ON email_outbox (status, next_attempt_at);

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  actor_email  TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity       TEXT,
  entity_id    TEXT,
  details      TEXT,
  -- failed R2 deletions are recorded here and retried by cron until resolved
  resolved     INTEGER NOT NULL DEFAULT 1 CHECK (resolved IN (0, 1))
);
CREATE INDEX idx_audit_log_at ON audit_log (at);
CREATE INDEX idx_audit_log_open ON audit_log (resolved, action);

CREATE TABLE rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Key/value state: content_updated_at, rebuild_triggered_at, rebuild_error
CREATE TABLE site_state (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- updated_at is maintained by triggers (recursive triggers are off by default in SQLite)
CREATE TRIGGER artworks_updated_at AFTER UPDATE ON artworks
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE artworks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER about_page_updated_at AFTER UPDATE ON about_page
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE about_page SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER social_links_updated_at AFTER UPDATE ON social_links
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE social_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
