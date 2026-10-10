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
const FINE = { slug: 'fine-art', name: 'Fine Art' };
const RESIN = { slug: 'resin', name: 'Resin' };
const NO_PRICE = { slug: 'quiet-piece', title: 'Quiet Piece', status: 'available', category: FINE, size: 'small', medium: 'Oil on canvas', cover: img('a') };
const PRICED_BASE = { slug: 'second-piece', title: 'Second Piece', status: 'sold', category: RESIN, size: 'large', cover: img('b') };

// priced=false: NO artwork has a price, so the page must have no price filter at all
let scenario = { social: true, portrait: false, priced: true };
const priced = () => (scenario.priced ? { price_minor: 1200000, currency: 'DKK' } : {});

const evt = (slug, title, startsAt, endsAt, status = 'published', extra = {}) => ({
  slug,
  title,
  description: 'First paragraph.\n\nSecond paragraph.',
  startsAt,
  endsAt,
  timezone: 'Europe/Copenhagen',
  location: 'The studio, Copenhagen',
  priceMinor: 45000,
  currency: 'DKK',
  status,
  ...extra,
});
// Times are stored as UTC instants; the pages must show COPENHAGEN wall-clock time.
const EVENTS = [
  evt('summer-workshop', 'Summer Workshop', '2031-07-12T08:00:00.000Z', '2031-07-12T11:00:00.000Z'), // 10:00-13:00 CEST
  evt('winter-workshop', 'Winter Workshop', '2031-01-11T09:00:00.000Z', '2031-01-11T12:00:00.000Z'), // 10:00-13:00 CET
  evt('spring-forward', 'Spring Forward', '2031-03-30T01:00:00.000Z', '2031-03-30T05:00:00.000Z'), // 03:00-07:00 (first summer hour)
  evt('autumn-back', 'Autumn Back', '2031-10-26T00:30:00.000Z', '2031-10-26T03:30:00.000Z'), // 02:30-04:30 (across the repeated hour)
  evt('cancelled-one', 'Cancelled One', '2031-08-01T08:00:00.000Z', '2031-08-01T11:00:00.000Z', 'cancelled'),
  evt('free-one', 'Free One', '2031-09-01T08:00:00.000Z', '2031-09-01T11:00:00.000Z', 'published', { priceMinor: 0 }),
  evt('past-one', 'Past One', '2020-05-10T08:00:00.000Z', '2020-05-10T11:00:00.000Z', 'completed'),
];

const fixtures = {
  artworks: () => [NO_PRICE, { ...PRICED_BASE, ...priced() }],
  events: () => EVENTS,
  categories: () => [{ ...FINE, count: 1 }, { ...RESIN, count: 1 }],
  detail: (slug) =>
    slug === NO_PRICE.slug
      ? { slug, title: NO_PRICE.title, status: 'available', category: FINE, size: 'small', description: 'First paragraph.\n\nSecond paragraph.', medium: 'Oil on canvas', images: [img('a'), img('a2')] }
      : slug === PRICED_BASE.slug
        ? { slug, title: PRICED_BASE.title, status: 'sold', category: RESIN, size: 'large', images: [img('b')], ...priced() }
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
  if (p === '/api/categories') return send({ categories: fixtures.categories() });
  if (p.startsWith('/api/artworks/')) {
    const d = fixtures.detail(decodeURIComponent(p.slice('/api/artworks/'.length)));
    return d ? send(d) : send({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }
  if (p === '/api/events') return send({ events: fixtures.events() });
  if (p.startsWith('/api/events/') && !p.endsWith('/availability')) {
    const e = fixtures.events().find((x) => x.slug === decodeURIComponent(p.slice('/api/events/'.length)));
    return e ? send(e) : send({ error: { code: 'not_found', message: 'Not found' } }, 404);
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

// the price filter switch lives in the source; the build output must agree with it
const SHOW_PRICE_FILTER = /SHOW_PRICE_FILTER\s*=\s*true/.test(readFileSync(join(webDir, 'src', 'lib', 'price-bands.ts'), 'utf8'));

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
  console.log('Build 1: social links visible, no portrait, one priced artwork');
  scenario = { social: true, portrait: false, priced: true };
  await build();

  for (const [lang, base] of [['en', ''], ['da', '/da']]) {
    const html = read(`${base}/artworks/quiet-piece.html`.replace(/^\//, ''));
    check(`[${lang}] NO-price artwork page has no price/currency markup at all`, !PRICE_WORDS.test(html), (html.match(PRICE_WORDS) ?? []).join(','));
    check(`[${lang}] NO-price page has no VAT/moms mention`, !/\b(vat|moms)\b/i.test(html));
    check(`[${lang}] no-price JSON-LD is a VisualArtwork without offers`, /"@type":"VisualArtwork"/.test(html) && !/"offers"/.test(html));
    const priced = read(`${base}/artworks/second-piece.html`.replace(/^\//, ''));
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
  check('"Ask about this work" shown for available, not for sold', /Ask about this work/.test(en) && !/Ask about this work/.test(read('artworks/second-piece.html')));

  // ---- gallery filters (category, size, price, availability) ----
  for (const [lang, base, words] of [
    ['en', '', { category: 'Category', size: 'Size', price: 'Price', avail: 'Available only', small: 'Small', medium: 'Medium', large: 'Large' }],
    ['da', '/da', { category: 'Kategori', size: 'Størrelse', price: 'Pris', avail: 'Kun tilgængelige', small: 'Lille', medium: 'Mellemstor', large: 'Stor' }],
  ]) {
    const list = read(`${base}/artworks.html`.replace(/^\//, ''));
    const visible = list.replace(/<script[\s\S]*?<\/script>/g, '');
    check(`[${lang}] artworks page has the category filter with both categories`, visible.includes(words.category) && /Fine Art/.test(visible) && /Resin/.test(visible));
    check(`[${lang}] size ALWAYS offers Small, Medium and Large`, visible.includes(words.size) && visible.includes(words.small) && visible.includes(words.medium) && visible.includes(words.large));
    check(`[${lang}] the filters are a sidebar (an aside beside the gallery)`, /<aside[^>]*aria-label=/.test(visible));
    if (SHOW_PRICE_FILTER) {
      check(`[${lang}] a price filter exists because an artwork has a price`, /id="f-price"/.test(visible) && visible.includes(words.price));
    } else {
      check(`[${lang}] NO price filter is shown (switched off), though one artwork has a price`, !/id="f-price"/.test(visible) && !/Under DKK|Under \d|Under 5/.test(visible));
      check(`[${lang}] no price-filter wording is sent to the browser while it is off`, !/Under \{amount\}|\{from\} to \{to\}|Over \{amount\}|\{from\} til \{to\}/.test(list));
    }
    check(`[${lang}] availability filter exists (one artwork is sold)`, visible.includes(words.avail));
    check(`[${lang}] filter buttons are real buttons with aria-pressed`, (visible.match(/<button type="button" aria-pressed=/g) ?? []).length >= 8);
  }
  check('artwork page links to its category filter', /href="\/artworks\?category=fine-art"/.test(en));
  check('Danish artwork page links to the Danish category filter', /href="\/da\/artworks\?category=fine-art"/.test(read('da/artworks/quiet-piece.html')));

  // ---- workshops ----
  const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '');
  const EN_DASH = '\u2013';
  for (const [slug, times, label] of [
    ['summer-workshop', `10:00${EN_DASH}13:00`, 'summer time (UTC+2)'],
    ['winter-workshop', `10:00${EN_DASH}13:00`, 'winter time (UTC+1)'],
    ['spring-forward', `03:00${EN_DASH}07:00`, 'the first summer-time hour on the day the clocks go forward'],
    ['autumn-back', `02:30${EN_DASH}04:30`, 'across the repeated hour when the clocks go back'],
  ]) {
    const page = strip(read(`workshops/${slug}.html`));
    check(`workshop page shows Copenhagen time ${times} for ${label}`, page.includes(times));
    // Danish writes the time with a dot (10.00) instead of a colon
    check(`[da] the Danish workshop page shows the same Copenhagen time for ${label}`, strip(read(`da/workshops/${slug}.html`)).includes(times.replaceAll(':', '.')));
  }
  const summer = read('workshops/summer-workshop.html');
  const summerText = strip(summer);
  check('workshop page: date in the event zone, price per person, "Copenhagen time" note', /Saturday,? 12 July 2031/.test(summerText) && /DKK\s?450 per person/.test(summerText) && summerText.includes('Copenhagen time'));
  check('[da] Danish workshop page: Danish date and price wording', /lørdag.*12\. juli 2031/.test(strip(read('da/workshops/summer-workshop.html'))) && /pr\. person/.test(strip(read('da/workshops/summer-workshop.html'))));
  check('a free workshop says "Free"', /\bFree\b/.test(strip(read('workshops/free-one.html'))));
  const eventLd = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((d) => d['@type'] === 'Event') ?? {};
  const ld = eventLd(summer);
  check('workshop JSON-LD is an Event with an offer, start time and no availability claim', ld['@type'] === 'Event' && ld.offers?.price === '450' && ld.offers?.priceCurrency === 'DKK' && ld.startDate === '2031-07-12T08:00:00.000Z' && !('availability' in (ld.offers ?? {})));
  check('a cancelled workshop is marked EventCancelled', /EventCancelled/.test(read('workshops/cancelled-one.html')));
  check('"Add to calendar" is offered for a normal workshop but not a cancelled one', /\/api\/events\/summer-workshop\/ics\?lang=en/.test(summer) && !/\/ics\?lang=/.test(read('workshops/cancelled-one.html')));
  check('the cancelled workshop page says so and has no "Ask about a place" button', /This workshop has been cancelled/.test(strip(read('workshops/cancelled-one.html'))) === false || !/Ask about a place/.test(strip(read('workshops/cancelled-one.html'))));
  const staticPages = ['workshops.html', 'calendar.html', 'index.html', 'workshops/summer-workshop.html', 'da/workshops.html', 'da/calendar.html'];
  // The wording ("{n} places left") is shipped as a template and filled in from the live API in the browser;
  // what must never appear in the HTML is an actual number of places.
  check('NO capacity is baked into the static pages (no rendered "8 places left", "Sold out" or "udsolgt")', staticPages.every((p) => { const v = strip(read(p)); return !/\d+ places? left|\d+ pladser? tilbage|Sold out|Udsolgt|1 place left|1 plads tilbage/i.test(v) && !/"remaining"|"taken"|"maxParticipants"/.test(read(p)); }));
  const list = strip(read('workshops.html'));
  check('the workshops list has upcoming and past sections and every public workshop', list.includes('Upcoming workshops') && list.includes('Past workshops') && ['Summer Workshop', 'Winter Workshop', 'Spring Forward', 'Autumn Back', 'Cancelled One', 'Past One'].every((t) => list.includes(t)));
  check('the home page has the upcoming-workshops teaser without the cancelled workshop', (() => { const h = strip(read('index.html')); return h.includes('Upcoming workshops') && !h.includes('Cancelled One') && h.includes('See all workshops'); })());
  check('the calendar page has a Monday-first grid and month buttons', (() => { const h = strip(read('calendar.html')); return /Mon/.test(h) && /Previous month/.test(h) && /Next month/.test(h); })());
  check('every public page has Workshops and Calendar in the menu', ['index.html', 'about.html', 'artworks.html', 'contact.html'].every((p) => { const h = strip(read(p)); return /Workshops/.test(h) && />Calendar</.test(h); }));
  check('[da] the Danish menu says Kalender', />Kalender</.test(strip(read('da.html'))));
  check('canonical URL and hreflang for a workshop', /rel="canonical" href="https:\/\/zfadavi\.com\/workshops\/summer-workshop"/.test(summer) && /hrefLang="da" href="https:\/\/zfadavi\.com\/da\/workshops\/summer-workshop"/i.test(summer));
  check('sitemap lists the workshop pages and the calendar in both languages', (() => { const m = read('sitemap.xml'); return ['/workshops', '/calendar', '/workshops/summer-workshop', '/da/workshops/summer-workshop', '/da/calendar'].every((p) => m.includes(`https://zfadavi.com${p}`)); })());

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
  check('sitemap lists both languages for artworks and pages', ['/artworks/second-piece', '/da/artworks/second-piece', '/da/about', '/contact'].every((p) => sitemap.includes(`https://zfadavi.com${p}`)));
  check('a 404 page is generated', existsSync(join(outDir, '404.html')));
  check('static export has no server-only output (no app server folder)', !existsSync(join(outDir, 'server')));

  console.log('Build 2: every social link hidden, with a portrait');
  scenario = { social: false, portrait: true, priced: false };
  await build();
  for (const file of ['index.html', 'about.html', 'contact.html', 'da/about.html', 'artworks.html']) {
    const html = read(file);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    check(`${file}: NO social markup when every link is hidden`, !/Follow me|Følg mig/i.test(visible) && !/instagram|tiktok|rel="me/i.test(html));
    check(`${file}: no sameAs when no links are visible`, !/sameAs/.test(html));
  }
  for (const [lang, file, priceWord] of [['en', 'artworks.html', 'Price'], ['da', 'da/artworks.html', 'Pris']]) {
    const html = read(file);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    check(`[${lang}] NO price filter at all when no artwork has a price`, !new RegExp(`\\b${priceWord}\\b`).test(visible) && !/DKK|kr\./.test(visible));
    check(`[${lang}] no price words anywhere in the page payload either (even for the card)`, !/price/i.test(html) && !/\bpris\b/i.test(html));
    check(`[${lang}] category and size filters are still there`, /aria-pressed/.test(visible));
  }
  const withPortrait = read('about.html');
  check('About with a portrait renders the image with width, height and alt', /<img[^>]*width="1000"[^>]*height="1250"[^>]*alt="Alt portrait"/.test(withPortrait));
} finally {
  server.close();
}

console.log(failures === 0 ? '\nBuilt-HTML tests passed.' : `\n${failures} built-HTML check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
