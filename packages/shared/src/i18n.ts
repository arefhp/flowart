import { DEFAULT_LOCALE, LOCALES, type Locale } from './constants';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Pick the text for a language, falling back to English when the Danish text is
 * missing or blank (section 16.1). English is the source of truth.
 */
export function pickText<T extends string | null | undefined>(
  locale: Locale,
  en: T,
  da: string | null | undefined,
): T | string {
  if (locale === 'da' && typeof da === 'string' && da.trim() !== '') return da;
  return en;
}

/** Prefix a site path with the language prefix (`/da`) for Danish; English is unprefixed. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? '/da' : `/da${clean}`;
}

/** Remove the language prefix from a pathname. */
export function stripLocalePrefix(pathname: string): { locale: Locale; path: string } {
  if (pathname === '/da' || pathname === '/da/') return { locale: 'da', path: '/' };
  if (pathname.startsWith('/da/')) return { locale: 'da', path: pathname.slice(3) };
  return { locale: 'en', path: pathname };
}
