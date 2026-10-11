import { notFound } from 'next/navigation';
import type { AboutContent, ArtworkDetail, ArtworkListItem, Locale, PublicCategory, PublicEvent, SocialLink } from './types';

/**
 * Build-time data access (spec section 1.2). The static site is generated from the public API.
 * The build fails loudly if the API is unreachable, instead of silently emitting an empty site,
 * unless ALLOW_EMPTY_BUILD=1 is set (first-ever bootstrap).
 */
const isDev = process.env.NODE_ENV === 'development';
export const API_BASE = (
  process.env.BUILD_API_BASE_URL ?? (isDev ? 'http://localhost:8787' : 'https://zfadavi.com')
).replace(/\/+$/, '');
const allowEmpty = process.env.ALLOW_EMPTY_BUILD === '1';

class ApiNotFound extends Error {}

/**
 * A static export needs at least one page for every dynamic route. A brand-new site (the first, empty
 * deploy) has no artworks or workshops yet, so one placeholder page is built; it just shows the 404 page.
 * The next rebuild, with real content, replaces it.
 */
const PLACEHOLDER_SLUG = '__none__';

async function get<T>(path: string, empty: T): Promise<T> {
  let res: Response;
  try {
    // Builds fetch once per URL and reuse it, so every page sees the same snapshot of the content.
    // In dev, always fetch fresh so a change made in the admin shows up on reload.
    res = await fetch(`${API_BASE}${path}`, { cache: isDev ? 'no-store' : 'force-cache' });
  } catch (err) {
    if (allowEmpty) {
      console.warn(`[build] API unreachable (${API_BASE}); continuing because ALLOW_EMPTY_BUILD=1`);
      return empty;
    }
    throw new Error(
      `Cannot reach the API at ${API_BASE} (${String(err)}). Start it with "npm run dev:worker", set BUILD_API_BASE_URL, or set ALLOW_EMPTY_BUILD=1 for the very first deploy.`,
    );
  }
  if (res.status === 404) throw new ApiNotFound(path);
  if (!res.ok) {
    if (allowEmpty) return empty;
    throw new Error(`API ${path} answered ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getArtworks(lang: Locale, opts: { featured?: boolean } = {}): Promise<ArtworkListItem[]> {
  const q = new URLSearchParams({ lang });
  if (opts.featured) q.set('featured', '1');
  return (await get<{ artworks: ArtworkListItem[] }>(`/api/artworks?${q}`, { artworks: [] })).artworks;
}

export async function getCategories(lang: Locale): Promise<PublicCategory[]> {
  return (await get<{ categories: PublicCategory[] }>(`/api/categories?lang=${lang}`, { categories: [] })).categories;
}

export async function getEvents(lang: Locale): Promise<PublicEvent[]> {
  return (await get<{ events: PublicEvent[] }>(`/api/events?lang=${lang}`, { events: [] })).events;
}

export async function getEvent(slug: string, lang: Locale): Promise<PublicEvent> {
  if (slug === PLACEHOLDER_SLUG) notFound();
  try {
    return await get<PublicEvent>(`/api/events/${encodeURIComponent(slug)}?lang=${lang}`, undefined as never);
  } catch (err) {
    if (err instanceof ApiNotFound) notFound();
    throw err;
  }
}

/** Slugs for generateStaticParams (every public event, including finished and cancelled ones). */
export async function getEventSlugs(): Promise<string[]> {
  const slugs = (await getEvents('en')).map((e) => e.slug);
  return slugs.length > 0 ? slugs : [PLACEHOLDER_SLUG];
}

export async function getArtwork(slug: string, lang: Locale): Promise<ArtworkDetail> {
  if (slug === PLACEHOLDER_SLUG) notFound();
  try {
    return await get<ArtworkDetail>(`/api/artworks/${encodeURIComponent(slug)}?lang=${lang}`, undefined as never);
  } catch (err) {
    if (err instanceof ApiNotFound) notFound();
    throw err;
  }
}

export async function getAbout(lang: Locale): Promise<AboutContent> {
  return get<AboutContent>(`/api/about?lang=${lang}`, { body: '' });
}

export async function getSocial(): Promise<SocialLink[]> {
  return (await get<{ links: SocialLink[] }>('/api/social', { links: [] })).links;
}

/** Slugs for generateStaticParams. */
export async function getArtworkSlugs(): Promise<string[]> {
  const slugs = (await getArtworks('en')).map((a) => a.slug);
  return slugs.length > 0 ? slugs : [PLACEHOLDER_SLUG];
}
