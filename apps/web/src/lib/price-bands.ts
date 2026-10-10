import type { ArtworkListItem } from './types';

/**
 * Price ranges offered as filter buttons, in Danish kroner (minor units, so 500000 = 5,000 DKK).
 * A band is only shown when at least one artwork falls in it, and the whole Price group is only
 * shown when some artwork has a price, so an unpriced collection shows no price filter at all.
 * To change the ranges, edit this list (see docs/MAINTENANCE.md).
 */
export interface PriceBand {
  id: 'under' | 'mid' | 'over';
  /** inclusive lower bound, in minor units */
  min?: number;
  /** exclusive upper bound, in minor units */
  max?: number;
}

export const PRICE_BAND_CURRENCY = 'DKK';

export const PRICE_BANDS: PriceBand[] = [
  { id: 'under', max: 5_000_00 },
  { id: 'mid', min: 5_000_00, max: 15_000_00 },
  { id: 'over', min: 15_000_00 },
];

export function inBand(a: Pick<ArtworkListItem, 'price_minor' | 'currency'>, band: PriceBand): boolean {
  if (a.price_minor === undefined || a.currency !== PRICE_BAND_CURRENCY) return false;
  return (band.min === undefined || a.price_minor >= band.min) && (band.max === undefined || a.price_minor < band.max);
}

/** Bands that contain at least one of these artworks. */
export function usableBands(artworks: Array<Pick<ArtworkListItem, 'price_minor' | 'currency'>>): PriceBand[] {
  return PRICE_BANDS.filter((band) => artworks.some((a) => inBand(a, band)));
}
