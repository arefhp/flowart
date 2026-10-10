-- Initial site content so the site is correct on first deploy (spec 4A and 4B).
-- The owner edits all of this later in /admin/about and /admin/social.

-- About text: copied verbatim from the owner's draft, including the first sentence,
-- which is a fragment. The owner can reword it in /admin/about. Danish is added there.
INSERT INTO about_page (id, heading, body, updated_at) VALUES (
  1,
  NULL,
  'My approach to visual storytelling through color, texture, and form. My work explores emotion, atmosphere, and the quiet balance between movement and stillness.

Working primarily with oil paint, I create expressive, intuitive compositions that invite reflection and personal interpretation. Through layered textures, harmonious color, and fluid forms, I seek to communicate emotions that are often difficult to express with words.

My current work is inspired by the delicate beauty of Persian miniature painting, where every detail is intentional and meaning is found in subtlety. Rather than telling a fixed story, I create spaces where viewers can pause, connect, and discover their own interpretations.

My creative process begins with observation or a simple idea and evolves through intuitive sketching, layering, and experimentation. For me, painting is a journey of exploration, one guided by clarity, purpose, and soul.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- Owner-supplied links, stored in their cleaned form (tracking parameters removed).
INSERT INTO social_links (id, platform, url, label, visible, sort_order, created_at, updated_at) VALUES
  ('5c1b0a52-0d8c-4b3b-9d0a-0a1f2c7a0001', 'instagram', 'https://www.instagram.com/zakereh.fadavi.art/', NULL, 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('5c1b0a52-0d8c-4b3b-9d0a-0a1f2c7a0002', 'facebook', 'https://www.facebook.com/share/1974LVc4VU/', NULL, 1, 2,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('5c1b0a52-0d8c-4b3b-9d0a-0a1f2c7a0003', 'tiktok', 'https://www.tiktok.com/@zakerehfadaviart', NULL, 1, 3,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO site_state (key, value, updated_at) VALUES
  ('content_updated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
