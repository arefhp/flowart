// Built-HTML tests (spec sections 4, 4A, 4B, 17 and 18). Runs a REAL `next build` against a tiny
// mock API and inspects the generated static HTML. Mandatory checks:
//   - an artwork WITHOUT a price has no price markup (in either language)
//   - the About page has no <img> without a portrait, and paragraphs render separately
//   - the footer has no social markup when every link is hidden
// Usage: npm run test:built-html   (stop `next dev` first; both use the .next folder)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(webDir, 'out');
const PORT = 8799;
const MEDIA = 'http://media.test/m';

const img = (name, w = 1200, h = 1500) => ({ url: `${MEDIA}/${name}`, alt: `Alt ${name}`, width: w, height: h });
const NO_PRICE = { slug: 'quiet-piece', title: 'Quiet Piece', status: 'available', medium: 'Oil on canvas', cover: img('a') };
const PRICED = { slug: 'priced-piece', title: 'Priced Piece', status: 'sold', cover: img('b'), price_minor: 1200000, currency: 'DKK' };

let scenario = { social: true, portrait: false };

const fixtures = {
  artworks: () => [NO_PRICE, PRICED],
  detail: (slug) =>
    slug === NO_PRICE.slug
      ? { slug, title: NO_PRICE.title, status: 'available', description: 'First paragraph.\n\nSecond paragraph.', medium: 'Oil on canvas', images: [img('a'), img('a2')] }
      : slug === PRICED.slug
        ? { slug, title: PRICED.title, status: 'sold', images: [img('b')], price_minor: 1200000, currency: 'DKK' }
        : null,
  about: () => ({
    body: 'One paragraph.\n\nTwo paragraph.\nstill two.\n\nThree paragraph.\n\nFour paragraph.',
    ...(scenario.portrait ? { portrait: img('portrait', 1000, 1250) } : {}),
  }),
  social: () => ({
    links: scenario.social
      ? [
          { platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/someone/' },
          { platform: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@someone' },
        ]
      : [],
  }),
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const p = url.pathname;
  if (p === '/api/artworks') return send({ artworks: fixtures.artworks() });
  if (p.startsWith('/api/artworks/')) {
    const d = fixtures.detail(decodeURIComponent(p.slice('/api/artworks/'.length)));
    return d ? send(d) : send({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }
  if (p === '/api/about') return send(fixtures.about());
  if (p === '/api/social') return send(fixtures.social());
  if (p === '/api/site-version') return send({ contentUpdatedAt: '2026-01-01T00:00:00.000Z' });
  send({ error: { code: 'not_found', message: 'Not found' } }, 404);
});

function build() {
  rmSync(join(webDir, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true }); // never reuse API data from the previous build
  // Async on purpose: the mock API runs in THIS process and must keep answering while Next builds.
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return new Promise((resolve, reject) => {
    const child = spawn(npx, ['next', 'build'], {
      cwd: webDir,
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        BUILD_API_BASE_URL: `http://127.0.0.1:${PORT}`,
        NEXT_PUBLIC_SITE_URL: 'https://zfadavi.com',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAtestsitekey',
      },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        console.error(output);
        reject(new Error('next build failed'));
      }
    });
  });
}

const read = (rel) => readFileSync(join(outDir, rel), 'utf8');
const allHtml = (dir = outDir) =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? (n === '_next' ? [] : allHtml(f)) : f.endsWith('.html') ? [f] : [];
  });

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}
const PRICE_WORDS = /\b(price|pris|dkk|currency|price_minor)\b/i;

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
try {
  console.log('Build 1: social links visible, no portrait');
  scenario = { social: true, portrait: false };
  await build();

  for (const [lang, base] of [['en', ''], ['da', '/da']]) {
    const html = read(`${base}/artworks/quiet-piece.html`.replace(/^\//, ''));
    check(`[${lang}] NO-price artwork page has no price/currency markup at all`, !PRICE_WORDS.test(html), (html.match(PRICE_WORDS) ?? []).join(','));
    check(`[${lang}] NO-price page has no VAT/moms mention`, !/\b(vat|moms)\b/i.test(html));
    check(`[${lang}] no-price JSON-LD is a VisualArtwork without offers`, /"@type":"VisualArtwork"/.test(html) && !/"offers"/.test(html));
    const priced = read(`${base}/artworks/priced-piece.html`.replace(/^\//, ''));
    check(`[${lang}] priced artwork shows its price`, /12[.,]000/.test(priced));
    check(`[${lang}] priced artwork JSON-LD has no offers either`, !/"offers"/.test(priced));
    const grid = read(`${base}/artworks.html`.replace(/^\//, ''));
    const card = grid.split('<li').find((s) => s.includes('Quiet Piece')) ?? '';
    check(`[${lang}] gallery card of the NO-price artwork has no price`, card.length > 0 && !PRICE_WORDS.test(card));
    check(`[${lang}] gallery shows one image per artwork (2 artworks, 2 gallery images)`, (grid.match(/<main[\s\S]*<\/main>/)?.[0].match(/<img /g) ?? []).length === 2);
  }

  const en = read('artworks/quiet-piece.html');
  check('html lang="en" on English pages', /<html lang="en"/.test(en));
  check('html lang="da" on Danish pages', /<html lang="da"/.test(read('da/artworks/quiet-piece.html')));
  check('canonical URL is absolute and correct', /rel="canonical" href="https:\/\/zfadavi\.com\/artworks\/quiet-piece"/.test(en));
  check('hreflang alternates for en, da and x-default', ['en', 'da', 'x-default'].every((l) => new RegExp(`hrefLang="${l}"`, 'i').test(en)));
  check('artwork page lists all images as thumbnails', (en.match(/aria-label="Image \d of 2"/g) ?? []).length === 2);
  check('"Ask about this work" shown for available, not for sold', /Ask about this work/.test(en) && !/Ask about this work/.test(read('artworks/priced-piece.html')));

  const about = read('about.html');
  check('About with NO portrait has no <img> at all', !/<img /.test(about));
  check('About renders each paragraph separately, single line breaks collapsed', (about.match(/<p>(One|Two|Three|Four) paragraph/g) ?? []).length === 4 && /Two paragraph\. still two\./.test(about));
  check('About text is centred when there is no portrait (no portrait column)', !/aspect-\[4\/5\]/.test(about));

  const home = read('index.html');
  check('footer shows the visible social links with safe markup', /instagram\.com\/someone/.test(home) && /rel="me noopener noreferrer"/.test(home));
  check('JSON-LD sameAs lists the visible links', /"sameAs":\["https:\/\/www\.instagram\.com\/someone\/","https:\/\/www\.tiktok\.com\/@someone"\]/.test(home));
  check('social links appear on the Contact and About pages too', /instagram\.com\/someone/.test(read('contact.html')) && /instagram\.com\/someone/.test(about));

  const markers = allHtml().filter((f) => /\[(CHECK|FILL)\b|UDFYLD/.test(readFileSync(f, 'utf8')));
  check('no [CHECK]/[FILL] placeholder marker in any page', markers.length === 0, markers.join(', '));
  const phones = allHtml().filter((f) => /(?<![\w.#-])\+?\d{2}[ ]?\d{2}[ ]?\d{2}[ ]?\d{2}[ ]?\d{2}(?![\w])/.test(readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')));
  check('no phone number is published', phones.length === 0, phones.join(', '));
  check('admin pages are not indexed', /name="robots" content="noindex/.test(read('admin.html')));
  check('robots.txt disallows the admin and points at the sitemap', /Disallow: \/admin/.test(read('robots.txt')) && /Sitemap: https:\/\/zfadavi\.com\/sitemap\.xml/.test(read('robots.txt')));
  const sitemap = read('sitemap.xml');
  check('sitemap lists both languages for artworks and pages', ['/artworks/priced-piece', '/da/artworks/priced-piece', '/da/about', '/contact'].every((p) => sitemap.includes(`https://zfadavi.com${p}`)));
  check('a 404 page is generated', existsSync(join(outDir, '404.html')));
  check('static export has no server-only output (no app server folder)', !existsSync(join(outDir, 'server')));

  console.log('Build 2: every social link hidden, with a portrait');
  scenario = { social: false, portrait: true };
  await build();
  for (const file of ['index.html', 'about.html', 'contact.html', 'da/about.html', 'artworks.html']) {
    const html = read(file);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    check(`${file}: NO social markup when every link is hidden`, !/Follow me|Følg mig/i.test(visible) && !/instagram|tiktok|rel="me/i.test(html));
    check(`${file}: no sameAs when no links are visible`, !/sameAs/.test(html));
  }
  const withPortrait = read('about.html');
  check('About with a portrait renders the image with width, height and alt', /<img[^>]*width="1000"[^>]*height="1250"[^>]*alt="Alt portrait"/.test(withPortrait));
} finally {
  server.close();
}

console.log(failures === 0 ? '\nBuilt-HTML tests passed.' : `\n${failures} built-HTML check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
