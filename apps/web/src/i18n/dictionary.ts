import type { Locale } from '@flowart/shared';

/**
 * UI wording in both languages (spec section 16.1). The text comes from docs/LANGUAGE_REVIEW.md.
 * No user-facing string is hard-coded in a component. A test fails if a key exists in one
 * language and not the other.
 */
export const en = {
  siteName: 'Zakereh Art',
  tagline: 'Oil paintings and art workshops in Copenhagen.',
  skipToContent: 'Skip to content',
  nav: {
    label: 'Main menu',
    home: 'Home',
    artworks: 'Artworks',
    about: 'About',
    contact: 'Contact',
  },
  language: { label: 'Language', en: 'English', da: 'Dansk' },
  status: { available: 'Available', reserved: 'Reserved', sold: 'Sold' },
  artwork: {
    medium: 'Medium',
    year: 'Year',
    size: 'Size',
    statusLabel: 'Status',
    priceLabel: 'Price',
    ask: 'Ask about this work',
    enquiryMessage: 'I am interested in the artwork "{title}".',
    imagesLabel: 'Images of {title}',
    viewLarge: 'View {n} larger',
    imageOf: 'Image {n} of {total}',
    close: 'Close',
    prev: 'Previous image',
    next: 'Next image',
  },
  home: {
    recent: 'Recent work',
    all: 'All artworks',
    empty: 'New work is on its way.',
  },
  artworksPage: {
    title: 'Artworks',
    empty: 'There are no artworks to show yet.',
  },
  about: { title: 'About' },
  contact: {
    title: 'Contact',
    intro: 'Write to me about a work, a workshop or anything else.',
    orEmail: 'You can also email',
    name: 'Name',
    email: 'Email',
    message: 'Message',
    send: 'Send message',
    sending: 'Sending...',
    success: 'Thank you, your message has been sent.',
    error: 'Something went wrong. Please try again or write to info@zfadavi.com.',
    nameRequired: 'Please enter your name.',
    emailInvalid: 'Please enter a valid email address.',
    messageShort: 'Please write a short message.',
    rateLimited: 'Too many messages. Please try again later.',
    humanCheck: 'We could not verify that you are human. Please try again.',
    humanLoading: 'Loading the spam check...',
    humanFailed: 'The spam check could not load. Please reload the page.',
    aboutArtwork: 'About the artwork',
  },
  footer: { follow: 'Follow me', privacy: 'Privacy policy', terms: 'Terms', opensInNewTab: 'opens in a new tab' },
  notFound: {
    title: 'Page not found',
    body: 'We cannot find that page. It may have been moved or removed.',
    back: 'Go to the home page',
  },
  meta: {
    homeTitle: 'Zakereh Art, oil paintings in Copenhagen',
    artworksTitle: 'Artworks',
    aboutTitle: 'About',
    contactTitle: 'Contact',
    privacyTitle: 'Privacy policy',
    termsTitle: 'Terms',
  },
};

export type Dict = typeof en;

export const da: Dict = {
  siteName: 'Zakereh Art',
  tagline: 'Oliemalerier og kunstworkshops i København.',
  skipToContent: 'Gå til indhold',
  nav: {
    label: 'Hovedmenu',
    home: 'Forside',
    artworks: 'Kunstværker',
    about: 'Om mig',
    contact: 'Kontakt',
  },
  language: { label: 'Sprog', en: 'English', da: 'Dansk' },
  status: { available: 'Tilgængelig', reserved: 'Reserveret', sold: 'Solgt' },
  artwork: {
    medium: 'Materialer og teknik',
    year: 'År',
    size: 'Størrelse',
    statusLabel: 'Status',
    priceLabel: 'Pris',
    ask: 'Spørg til værket',
    enquiryMessage: 'Jeg er interesseret i værket "{title}".',
    imagesLabel: 'Billeder af {title}',
    viewLarge: 'Se billede {n} stort',
    imageOf: 'Billede {n} af {total}',
    close: 'Luk',
    prev: 'Forrige billede',
    next: 'Næste billede',
  },
  home: {
    recent: 'Nyere værker',
    all: 'Alle kunstværker',
    empty: 'Nye værker er på vej.',
  },
  artworksPage: {
    title: 'Kunstværker',
    empty: 'Der er ingen værker at vise endnu.',
  },
  about: { title: 'Om mig' },
  contact: {
    title: 'Kontakt',
    intro: 'Skriv til mig om et værk, en workshop eller noget helt andet.',
    orEmail: 'Du kan også skrive til',
    name: 'Navn',
    email: 'E-mail',
    message: 'Besked',
    send: 'Send besked',
    sending: 'Sender...',
    success: 'Tak, din besked er sendt.',
    error: 'Noget gik galt. Prøv igen, eller skriv til info@zfadavi.com.',
    nameRequired: 'Skriv dit navn.',
    emailInvalid: 'Indtast en gyldig e-mailadresse.',
    messageShort: 'Skriv en kort besked.',
    rateLimited: 'For mange beskeder. Prøv igen senere.',
    humanCheck: 'Vi kunne ikke bekræfte, at du er et menneske. Prøv igen.',
    humanLoading: 'Indlæser spambeskyttelsen...',
    humanFailed: 'Spambeskyttelsen kunne ikke indlæses. Genindlæs siden.',
    aboutArtwork: 'Om værket',
  },
  footer: { follow: 'Følg mig', privacy: 'Privatlivspolitik', terms: 'Vilkår', opensInNewTab: 'åbner i et nyt faneblad' },
  notFound: {
    title: 'Siden findes ikke',
    body: 'Vi kan ikke finde siden. Den kan være flyttet eller fjernet.',
    back: 'Gå til forsiden',
  },
  meta: {
    homeTitle: 'Zakereh Art, oliemalerier i København',
    artworksTitle: 'Kunstværker',
    aboutTitle: 'Om mig',
    contactTitle: 'Kontakt',
    privacyTitle: 'Privatlivspolitik',
    termsTitle: 'Vilkår',
  },
};

export const dictionaries: Record<Locale, Dict> = { en, da };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale];
}

/** Replace {name} placeholders. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** Locale tag used by Intl for each page language. */
export const intlLocale: Record<Locale, string> = { en: 'en-GB', da: 'da-DK' };

/** Format a price. Callers must only call this when a price exists (the no-price rule). */
export function formatPrice(locale: Locale, minor: number, currency: string): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
