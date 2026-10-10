import { describe, expect, it } from 'vitest';
import { PRICE_BANDS, inBand, usableBands } from './price-bands';

const priced = (price_minor: number, currency = 'DKK') => ({ price_minor, currency });
const [under, mid, over] = PRICE_BANDS as [(typeof PRICE_BANDS)[number], (typeof PRICE_BANDS)[number], (typeof PRICE_BANDS)[number]];

describe('price ranges for the gallery filter', () => {
  it('puts an amount in exactly one range; the lower edge belongs to the higher range', () => {
    expect(inBand(priced(450_000), under)).toBe(true);
    expect(inBand(priced(499_900), under)).toBe(true);
    expect(inBand(priced(500_000), under)).toBe(false);
    expect(inBand(priced(500_000), mid)).toBe(true);
    expect(inBand(priced(1_499_900), mid)).toBe(true);
    expect(inBand(priced(1_500_000), mid)).toBe(false);
    expect(inBand(priced(1_500_000), over)).toBe(true);
    expect(inBand(priced(99_999_900), over)).toBe(true);
  });

  it('an artwork WITHOUT a price is in no range', () => {
    for (const band of PRICE_BANDS) expect(inBand({}, band)).toBe(false);
  });

  it('only Danish kroner prices are compared with the ranges', () => {
    expect(inBand(priced(450_000, 'EUR'), under)).toBe(false);
  });

  it('only ranges that contain an artwork are offered', () => {
    expect(usableBands([priced(450_000), priced(800_000)]).map((b) => b.id)).toEqual(['under', 'mid']);
    expect(usableBands([priced(2_000_000)]).map((b) => b.id)).toEqual(['over']);
  });

  it('no priced artwork means no price ranges at all, so no price filter', () => {
    expect(usableBands([{}, {}])).toEqual([]);
    expect(usableBands([])).toEqual([]);
  });
});
