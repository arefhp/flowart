/**
 * npm run seed: sample content for LOCAL development only.
 *
 * - Talks to Wrangler's local D1/R2 emulation (`getPlatformProxy`), never to production.
 * - Uses the owner's photos from the repo's `input/` folder when present (about.jpeg and the
 *   painting photos); otherwise it generates placeholder images locally. No downloads.
 * - Idempotent: running it again changes nothing that already exists.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TIMEZONE, IMAGE_WIDTHS, dayInZone, localToUtc, parseWebpSize, type ImageWidth } from '@flowart/shared';
import sharp from 'sharp';
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../src/env';
import { setState } from '../src/lib/site-state';
import { setPortrait } from '../src/services/about';
import { addImage, createArtwork, setCover, type ArtworkRow } from '../src/services/artworks';
import { createEvent, publishEvent } from '../src/services/events';
import { cancelEvent } from '../src/services/bookings-admin';
import type { ValidatedUpload } from '../src/services/images';

if (process.argv.includes('--remote') || process.env.APP_ENV === 'production') {
  console.error('Refusing to seed: this script only works against the local emulation, never production.');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.join(here, '..');
const inputDir = path.join(workerDir, '..', '..', 'input');

type Source = { name: string; load: () => Promise<Buffer> };

/** Placeholder painting generated with sharp (no external download). */
function placeholder(label: string, hue: number): Source {
  return {
    name: `placeholder ${label}`,
    load: async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2000">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue},45%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},40%,32%)"/>
        </linearGradient></defs>
        <rect width="1600" height="2000" fill="url(#g)"/>
        <text x="800" y="1000" font-family="serif" font-size="96" fill="white" fill-opacity="0.85" text-anchor="middle">${label}</text>
      </svg>`;
      return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    },
  };
}

function loadSources(): { paintings: Source[]; portrait: Source; usingInput: boolean } {
  const files = existsSync(inputDir) ? readdirSync(inputDir) : [];
  const image = (f: string) => /\.(jpe?g|png|webp)$/i.test(f);
  const portraitFile = files.find((f) => /^about\./i.test(f) && image(f));
  const paintingFiles = files.filter((f) => image(f) && f !== portraitFile).sort((a, b) => a.localeCompare(b));
  const fromFile = (f: string): Source => ({ name: f, load: () => readFile(path.join(inputDir, f)) });

  const paintings = paintingFiles.map(fromFile);
  const fallback = [placeholder('Sample 1', 215), placeholder('Sample 2', 25), placeholder('Sample 3', 140), placeholder('Sample 4', 330)];
  while (paintings.length < 4) paintings.push(fallback[paintings.length]!);
  return {
    paintings,
    portrait: portraitFile ? fromFile(portraitFile) : placeholder('Portrait', 280),
    usingInput: paintingFiles.length > 0 || Boolean(portraitFile),
  };
}

/** The three WebP variants the admin browser would make (never enlarged past the source). */
async function makeUpload(source: Source): Promise<ValidatedUpload> {
  const input = await source.load();
  const meta = await sharp(input).rotate().metadata();
  const sourceWidth = meta.width ?? 1920;
  const variants = {} as Record<ImageWidth, Uint8Array>;
  let largest = { width: 0, height: 0 };
  for (const w of IMAGE_WIDTHS) {
    const buf = await sharp(input)
      .rotate()
      .resize({ width: Math.min(w, sourceWidth), withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    variants[w] = new Uint8Array(buf);
    const size = parseWebpSize(variants[w]);
    if (!size) throw new Error(`Could not read the WebP size for ${source.name}`);
    if (w === 1920) largest = size;
  }
  return { variants, ...largest };
}

type SeedArtwork = {
  title: string;
  title_da: string | null;
  description: string;
  description_da: string | null;
  price_minor: number | null;
  currency: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  medium: string | null;
  medium_da: string | null;
  year: number | null;
  status: ArtworkRow['status'];
  featured: boolean;
  /** slug of a category created by migration 0003 */
  category: 'fine-art' | 'resin';
  size_class: 'small' | 'medium' | 'large';
  images: Array<{ source: number; alt: string; alt_da: string | null }>;
  cover?: number;
};

const SEED: SeedArtwork[] = [
  {
    title: 'Quiet Garden',
    title_da: 'Den stille have',
    description:
      'Layers of oil paint build a garden that is more felt than seen.\n\nThe colors were mixed slowly over several weeks, and the composition grew from a single sketch made at dusk.',
    description_da:
      'Lag på lag af oliemaling skaber en have, der mere føles end ses.\n\nFarverne blev blandet langsomt over flere uger, og kompositionen voksede ud af en enkelt skitse tegnet i skumringen.',
    price_minor: 1_200_000,
    currency: 'DKK',
    width_cm: 60,
    height_cm: 80,
    depth_cm: 2,
    medium: 'Oil on canvas',
    medium_da: 'Olie på lærred',
    year: 2025,
    status: 'available',
    featured: true,
    category: 'fine-art',
    size_class: 'medium',
    images: [
      { source: 0, alt: 'Quiet Garden, full view', alt_da: 'Den stille have, hele værket' },
      { source: 1, alt: 'Quiet Garden, detail of the brushwork', alt_da: 'Den stille have, penselstrøg i detaljen' },
    ],
  },
  {
    // No price on purpose: the public site must show no price element for this one.
    title: 'Evening Reverie',
    title_da: null,
    description: 'A study in warm light. If you would like to know more about this work, use the button below.',
    description_da: null,
    price_minor: null,
    currency: null,
    width_cm: 50,
    height_cm: 70,
    depth_cm: null,
    medium: 'Oil on canvas',
    medium_da: null,
    year: 2025,
    status: 'available',
    featured: false,
    category: 'fine-art',
    size_class: 'medium',
    images: [
      { source: 1, alt: 'Evening Reverie, full view', alt_da: null },
      { source: 2, alt: 'Evening Reverie, in daylight', alt_da: null },
      { source: 3, alt: 'Evening Reverie, close detail', alt_da: null },
    ],
    cover: 1,
  },
  {
    title: 'Morning Light',
    title_da: 'Morgenlys',
    description: 'A small painting about the first light of the day.',
    description_da: null,
    price_minor: 850_000,
    currency: 'DKK',
    width_cm: 40,
    height_cm: 40,
    depth_cm: null,
    medium: 'Oil on panel',
    medium_da: null,
    year: 2024,
    status: 'sold',
    featured: false,
    category: 'fine-art',
    size_class: 'small',
    images: [{ source: 2, alt: 'Morning Light', alt_da: null }],
  },
  {
    title: 'Work in progress',
    title_da: null,
    description: 'A hidden draft: it never appears on the public site.',
    description_da: null,
    price_minor: null,
    currency: null,
    width_cm: null,
    height_cm: null,
    depth_cm: null,
    medium: null,
    medium_da: null,
    year: null,
    status: 'hidden',
    featured: false,
    category: 'fine-art',
    size_class: 'large',
    images: [{ source: 3, alt: 'A draft painting', alt_da: null }],
  },
  {
    title: 'Resin Tide',
    title_da: 'Harpiksbølge',
    description: 'Layers of poured resin and pigment, set to catch the light as you move around it.',
    description_da: null,
    price_minor: 450_000,
    currency: 'DKK',
    width_cm: 30,
    height_cm: 30,
    depth_cm: 3,
    medium: 'Resin and pigment on panel',
    medium_da: 'Harpiks og pigment på plade',
    year: 2026,
    status: 'available',
    featured: false,
    category: 'resin',
    size_class: 'small',
    images: [{ source: 3, alt: 'Resin Tide, full view', alt_da: null }],
  },
];

/** The Copenhagen calendar day (YYYY-MM-DD) that is at least `minDays` from now and falls on `weekday` (0 = Sunday). */
function dayOnOrAfter(minDays: number, weekday: number): string {
  for (let add = minDays; add < minDays + 8; add++) {
    const day = dayInZone(new Date(Date.now() + add * 86_400_000).toISOString(), DEFAULT_TIMEZONE);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === weekday) return day;
  }
  throw new Error('no such weekday');
}

type SeedEvent = {
  title: string;
  title_da: string | null;
  description: string;
  description_da: string | null;
  location: string;
  location_da: string | null;
  day: string;
  from: string;
  to: string;
  max_participants: number;
  price_minor: number;
  outcome: 'published' | 'draft' | 'cancelled' | 'completed';
};

/** Workshops with dates relative to today, so they are always upcoming however long ago you seeded. */
async function seedEvents(env: Env): Promise<number> {
  const past = dayInZone(new Date(Date.now() - 30 * 86_400_000).toISOString(), DEFAULT_TIMEZONE);
  const events: SeedEvent[] = [
    {
      title: 'Oil Painting for Beginners',
      title_da: 'Oliemaling for begyndere',
      description:
        'An unhurried Saturday in the studio. We start with colour mixing, then build a small painting in layers, step by step.\n\nNo experience needed. Paint, canvas, brushes and snacks are all included.',
      description_da:
        'En rolig lørdag i atelieret. Vi starter med farveblanding og bygger derefter et lille maleri op i lag, trin for trin.\n\nDu behøver ingen erfaring. Maling, lærred, pensler og snacks er inkluderet.',
      location: 'The studio, Copenhagen',
      location_da: 'Atelieret, København',
      day: dayOnOrAfter(10, 6),
      from: '10:00',
      to: '14:00',
      max_participants: 8,
      price_minor: 55_000,
      outcome: 'published',
    },
    {
      title: 'Resin Art Evening',
      title_da: null,
      description: 'Pour, tilt and swirl: an evening of resin and pigment. You take your own piece home once it has cured.',
      description_da: null,
      location: 'The studio, Copenhagen',
      location_da: null,
      day: dayOnOrAfter(24, 4),
      from: '18:00',
      to: '21:00',
      max_participants: 6,
      price_minor: 65_000,
      outcome: 'published',
    },
    {
      title: 'Colour Study Day',
      title_da: 'Farvestudiedag',
      description: 'A draft that is not public yet: a full day exploring colour in oil.',
      description_da: null,
      location: 'The studio, Copenhagen',
      location_da: null,
      day: dayOnOrAfter(45, 0),
      from: '10:00',
      to: '16:00',
      max_participants: 10,
      price_minor: 90_000,
      outcome: 'draft',
    },
    {
      title: 'Autumn Landscape Morning',
      title_da: null,
      description: 'This workshop was cancelled, to show how a cancelled event looks.',
      description_da: null,
      location: 'The studio, Copenhagen',
      location_da: null,
      day: dayOnOrAfter(17, 2),
      from: '09:30',
      to: '12:30',
      max_participants: 8,
      price_minor: 45_000,
      outcome: 'cancelled',
    },
    {
      title: 'Winter Still Life',
      title_da: null,
      description: 'A workshop that has already taken place, to show the past list.',
      description_da: null,
      location: 'The studio, Copenhagen',
      location_da: null,
      day: past,
      from: '10:00',
      to: '13:00',
      max_participants: 8,
      price_minor: 45_000,
      outcome: 'completed',
    },
  ];

  let added = 0;
  for (const e of events) {
    const exists = await env.DB.prepare('SELECT id FROM events WHERE title = ?1').bind(e.title).first();
    if (exists) {
      console.log(`  = event "${e.title}" already exists, skipped`);
      continue;
    }
    const start = localToUtc(`${e.day}T${e.from}`, DEFAULT_TIMEZONE);
    const end = localToUtc(`${e.day}T${e.to}`, DEFAULT_TIMEZONE);
    if (!start.ok || !end.ok) throw new Error(`Seed time is invalid for ${e.title}`);
    const created = await createEvent(env, {
      title: e.title,
      title_da: e.title_da,
      description: e.description,
      description_da: e.description_da,
      location: e.location,
      location_da: e.location_da,
      starts_local: `${e.day}T${e.from}`,
      ends_local: `${e.day}T${e.to}`,
      timezone: DEFAULT_TIMEZONE,
      max_participants: e.max_participants,
      price_minor: e.price_minor,
      currency: 'DKK',
      starts_at: start.utc,
      ends_at: end.utc,
    });
    if (e.outcome === 'published') await publishEvent(env, created.id);
    if (e.outcome === 'cancelled') await cancelEvent(env, created.id, true);
    if (e.outcome === 'completed') await env.DB.prepare(`UPDATE events SET status = 'completed' WHERE id = ?1`).bind(created.id).run();
    console.log(`  + event "${e.title}" (${e.outcome}, ${e.day} ${e.from})`);
    added++;
  }
  return added;
}

async function main() {
  const { env, dispose } = await getPlatformProxy<Env>({ configPath: path.join(workerDir, 'wrangler.jsonc') });
  try {
    const { paintings, portrait, usingInput } = loadSources();
    console.log(usingInput ? 'Using your photos from the input/ folder.' : 'No photos in input/; generating placeholder images.');

    let created = 0;
    for (const spec of SEED) {
      const exists = await env.DB.prepare('SELECT id FROM artworks WHERE title = ?1').bind(spec.title).first();
      if (exists) {
        console.log(`  = "${spec.title}" already exists, skipped`);
        continue;
      }
      const { images, cover, category, ...fields } = spec;
      const cat = await env.DB.prepare('SELECT id FROM categories WHERE slug = ?1').bind(category).first<{ id: string }>();
      if (!cat) throw new Error(`Category "${category}" is missing: run npm run migrate:local first.`);
      const art = await createArtwork(env, { ...fields, category_id: cat.id });
      const ids: string[] = [];
      for (const img of images) {
        const upload = await makeUpload(paintings[img.source % paintings.length]!);
        const updated = await addImage(env, art.id, upload, { alt_text: img.alt, alt_text_da: img.alt_da });
        ids.push(updated.images[updated.images.length - 1]!.id);
      }
      if (cover !== undefined && ids[cover]) await setCover(env, art.id, ids[cover]!);
      console.log(`  + "${spec.title}" (${spec.status}, ${images.length} image${images.length === 1 ? '' : 's'}${spec.price_minor === null ? ', no price' : ''})`);
      created++;
    }

    const about = await env.DB.prepare('SELECT portrait_key_base FROM about_page WHERE id = 1').first<{ portrait_key_base: string | null }>();
    if (!about?.portrait_key_base) {
      await setPortrait(env, 'seed', await makeUpload(portrait), {
        alt: 'Portrait of the artist',
        alt_da: 'Portræt af kunstneren',
      });
      console.log('  + About portrait');
      created++;
    } else {
      console.log('  = About portrait already set, skipped');
    }

    created += await seedEvents(env);

    await setState(env, 'content_updated_at', new Date().toISOString());
    console.log(created ? `Done. Added ${created} item(s).` : 'Nothing to add: the sample data is already there.');
  } finally {
    await dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
