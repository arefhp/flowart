import type { Locale } from '@flowart/shared';

export type { Locale };

export interface PublicImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export type ArtworkStatus = 'available' | 'reserved' | 'sold';

export interface CategoryRef {
  slug: string;
  name: string;
}

export type SizeClass = 'small' | 'medium' | 'large';

export interface PublicCategory extends CategoryRef {
  count: number;
}

export interface ArtworkListItem {
  slug: string;
  title: string;
  status: ArtworkStatus;
  category?: CategoryRef;
  size?: SizeClass;
  medium?: string;
  cover: PublicImage;
  price_minor?: number;
  currency?: string;
}

export interface ArtworkDetail {
  slug: string;
  title: string;
  status: ArtworkStatus;
  category?: CategoryRef;
  size?: SizeClass;
  description?: string;
  medium?: string;
  year?: number;
  dimensions?: { width_cm?: number; height_cm?: number; depth_cm?: number };
  images: PublicImage[];
  price_minor?: number;
  currency?: string;
}

export interface AboutContent {
  heading?: string;
  body: string;
  portrait?: PublicImage;
}

export interface SocialLink {
  platform: string;
  label: string;
  url: string;
}
