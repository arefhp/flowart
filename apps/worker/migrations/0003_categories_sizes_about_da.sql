-- Categories (admin-managed), artwork size class (Small / Medium / Large), and the Danish About text.

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  name_da     TEXT CHECK (name_da IS NULL OR length(name_da) <= 60),
  slug        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- two categories cannot share a name, whatever the capitalisation
CREATE UNIQUE INDEX idx_categories_name ON categories (lower(trim(name)));

CREATE TRIGGER categories_updated_at AFTER UPDATE ON categories
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- Starting categories. The owner can rename, add and delete them in /admin/categories.
INSERT INTO categories (id, name, name_da, slug, sort_order, created_at, updated_at) VALUES
  ('a7d1c1d0-5b0e-4a4e-9d57-0c0f1e000001', 'Fine Art', NULL, 'fine-art', 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('a7d1c1d0-5b0e-4a4e-9d57-0c0f1e000002', 'Resin', NULL, 'resin', 2,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- One category per artwork. RESTRICT: a category that still has artworks cannot be deleted
-- (the API also checks first, to give a friendly message).
ALTER TABLE artworks ADD COLUMN category_id TEXT REFERENCES categories (id) ON DELETE RESTRICT;
-- Chosen by the owner when adding the artwork (not calculated from the centimetres).
ALTER TABLE artworks ADD COLUMN size_class TEXT CHECK (size_class IN ('small', 'medium', 'large'));
CREATE INDEX idx_artworks_category ON artworks (category_id);

-- Artworks that already existed go into the first category.
UPDATE artworks SET category_id = 'a7d1c1d0-5b0e-4a4e-9d57-0c0f1e000001' WHERE category_id IS NULL;

-- Danish version of the About statement (a translation of the owner's English text; the owner can
-- reword it in /admin/about). Only filled in when no Danish text exists yet.
UPDATE about_page SET body_da =
'Min tilgang til visuel fortælling gennem farve, tekstur og form. Mit arbejde udforsker følelser, atmosfære og den stille balance mellem bevægelse og stilhed.

Jeg arbejder primært med oliemaling og skaber udtryksfulde, intuitive kompositioner, der inviterer til refleksion og personlig fortolkning. Gennem lagdelte teksturer, harmoniske farver og flydende former søger jeg at formidle følelser, som ofte er svære at udtrykke med ord.

Mit nuværende arbejde er inspireret af den sarte skønhed i persisk miniaturemaleri, hvor hver detalje er bevidst, og meningen findes i det subtile. I stedet for at fortælle en fastlagt historie skaber jeg rum, hvor beskueren kan holde pause, finde forbindelse og opdage sine egne fortolkninger.

Min skabende proces begynder med en iagttagelse eller en enkel idé og udvikler sig gennem intuitiv skitsering, lagdeling og eksperimenter. For mig er maleri en rejse af udforskning, ledet af klarhed, formål og sjæl.'
WHERE id = 1 AND body_da IS NULL;

UPDATE site_state SET value = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'content_updated_at';
