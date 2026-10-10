import type { Locale } from '@flowart/shared';

export type { Locale };

export interface PublicImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export type ArtworkStatus = 'available' | 'reserved' | 'sold';

export interface ArtworkListItem {
  slug: string;
  title: string;
  status: ArtworkStatus;
  medium?: string;
  cover: PublicImage;
  price_minor?: number;
  currency?: string;
}

export interface ArtworkDetail {
  slug: string;
  title: string;
  status: ArtworkStatus;
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
