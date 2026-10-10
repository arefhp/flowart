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
import { IMAGE_WIDTHS, parseWebpSize, type ImageWidth } from '@flowart/shared';
import sharp from 'sharp';
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../src/env';
import { setState } from '../src/lib/site-state';
import { setPortrait } from '../src/services/about';
import { addImage, createArtwork, setCover, type ArtworkRow } from '../src/services/artworks';
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
    images: [{ source: 3, alt: 'A draft painting', alt_da: null }],
  },
];

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
      const { images, cover, ...fields } = spec;
      const art = await createArtwork(env, fields);
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
