import type { MetadataRoute } from 'next';
import { getArtworks, getEvents } from '@/lib/api';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-static';

/** Published artworks and the fixed pages, each in both languages with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [artworks, events] = await Promise.all([getArtworks('en'), getEvents('en')]);
  const paths = [
    '/',
    '/artworks',
    '/workshops',
    '/calendar',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    ...artworks.map((a) => `/artworks/${a.slug}`),
    ...events.map((e) => `/workshops/${e.slug}`),
  ];
  return paths.flatMap((path) =>
    (['en', 'da'] as const).map((locale) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: { en: absoluteUrl('en', path), da: absoluteUrl('da', path) } },
    })),
  );
}
