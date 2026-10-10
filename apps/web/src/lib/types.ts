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

export type EventStatus = 'published' | 'cancelled' | 'completed';

/** A workshop. Capacity is NOT part of it: the static pages never carry availability. */
export interface PublicEvent {
  slug: string;
  title: string;
  description?: string;
  /** UTC instants */
  startsAt: string;
  endsAt: string;
  /** the zone the event happens in; times are shown in it */
  timezone: string;
  location?: string;
  /** per person, minor units; 0 = free */
  priceMinor: number;
  currency: string;
  status: EventStatus;
}

/** Live capacity from the API (fetched in the browser, never baked into a page). */
export interface EventAvailability {
  slug: string;
  remaining: number;
  soldOut: boolean;
  bookable: boolean;
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
