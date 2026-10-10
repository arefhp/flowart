import { localePath, type Locale } from '@flowart/shared';
import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from './config';

/** Absolute URL for a language-neutral path. */
export function absoluteUrl(locale: Locale, path: string): string {
  return `${SITE_URL}${localePath(locale, path)}`;
}

/**
 * Title, description, canonical URL, hreflang alternates and Open Graph for one page.
 * `path` is the language-neutral path (`/artworks/blue-hour`).
 */
export function pageMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description?: string;
  image?: string;
  /** set for pages that exist in one language only */
  noAlternates?: boolean;
}): Metadata {
  const { locale, path, title, description, image } = opts;
  const url = absoluteUrl(locale, path);
  const alternates = opts.noAlternates
    ? { canonical: url }
    : {
        canonical: url,
        languages: {
          en: absoluteUrl('en', path),
          da: absoluteUrl('da', path),
          'x-default': absoluteUrl('en', path),
        },
      };
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: locale === 'da' ? 'da_DK' : 'en_GB',
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  };
}
