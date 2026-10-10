export const LOCALES = ['en', 'da'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const ARTWORK_STATUSES = ['available', 'reserved', 'sold', 'hidden'] as const;
export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

/** Statuses that are visible on the public site. `hidden` is never returned publicly. */
export const PUBLIC_ARTWORK_STATUSES = ['available', 'reserved', 'sold'] as const;

/** Size class chosen by the owner when adding an artwork; visitors can filter by it. */
export const SIZE_CLASSES = ['small', 'medium', 'large'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

/** Nominal widths of the pre-generated WebP variants (section 10). */
export const IMAGE_WIDTHS = [480, 960, 1920] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'pinterest',
  'x',
  'behance',
  'other',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const LIMITS = {
  titleMax: 200,
  mediumMax: 200,
  descriptionMax: 5000,
  altTextMax: 300,
  aboutBodyMax: 5000,
  aboutHeadingMax: 200,
  contactNameMax: 120,
  contactMessageMax: 5000,
  contactMessageMin: 5,
  categoryNameMax: 60,
  socialLinksMax: 12,
  socialUrlMax: 500,
  socialLabelMax: 60,
  imagesPerArtworkMax: 20,
  /** per web variant */
  variantMaxBytes: 4 * 1024 * 1024,
} as const;
