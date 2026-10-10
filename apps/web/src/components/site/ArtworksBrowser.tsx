'use client';

import { SIZE_CLASSES, type Locale, type SizeClass } from '@flowart/shared';
import { useEffect, useMemo, useState } from 'react';
import { fmt, formatPrice, type Dict } from '@/i18n/dictionary';
import { PRICE_BAND_CURRENCY, inBand, usableBands, type PriceBand } from '@/lib/price-bands';
import type { ArtworkListItem, PublicCategory } from '@/lib/types';
import { ArtworkGrid } from './ArtworkGrid';
import type { LabelStrings } from './ArtworkLabel';

/** Only the strings this component needs are passed in, not the whole dictionary. */
export type PriceStrings = Pick<Dict['filters'], 'price' | 'under' | 'between' | 'over'>;
export type BrowserStrings = {
  /** the price wording is left out entirely when no artwork has a price */
  filters: Omit<Dict['filters'], keyof PriceStrings> & Partial<PriceStrings>;
  label: LabelStrings;
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[44px] border px-4 text-[0.95rem] transition-colors ${
        active ? 'border-ink bg-ink text-wall' : 'border-hairline bg-transparent text-ink hover:border-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Group({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="grid items-center gap-x-6 gap-y-1 md:grid-cols-[7.5rem_1fr]">
      <span id={id} className="text-sm text-stone">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * The gallery with simple filters: category, size, price range and "available only". A filter is
 * only shown when it offers a real choice (for example the Price group exists only when some artwork
 * has a price). The choices live in the address (?category=resin&size=small), so a filtered view
 * can be shared. The page is built with EVERY artwork in the HTML (good for search engines and
 * for visitors without JavaScript); the choices from the address are applied once it loads.
 */

type Raw = { category: string | null; size: string | null; price: string | null; available: string | null };
const NONE: Raw = { category: null, size: null, price: null, available: null };

function readAddress(): Raw {
  const p = new URLSearchParams(window.location.search);
  return { category: p.get('category'), size: p.get('size'), price: p.get('price'), available: p.get('available') };
}

function writeAddress(raw: Raw) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) q.set(k, v);
  const qs = q.toString();
  window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

export function ArtworksBrowser({
  artworks,
  categories,
  locale,
  t,
}: {
  artworks: ArtworkListItem[];
  categories: PublicCategory[];
  locale: Locale;
  t: BrowserStrings;
}) {
  const [raw, setRaw] = useState<Raw>(NONE);
  const f = t.filters;

  // apply the choices in the address after load, and follow the browser's back/forward buttons
  useEffect(() => {
    const sync = () => setRaw(readAddress());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const sizes = SIZE_CLASSES.filter((s) => artworks.some((a) => a.size === s));
  const bands = useMemo(() => usableBands(artworks), [artworks]);
  const hasUnavailable = artworks.some((a) => a.status !== 'available') && artworks.some((a) => a.status === 'available');

  // read the choices from the address; anything that is not a real option is ignored
  const category = categories.find((c) => c.slug === raw.category)?.slug ?? null;
  const size = sizes.find((s) => s === raw.size) ?? null;
  const band: PriceBand | null = bands.find((b) => b.id === raw.price) ?? null;
  const availableOnly = raw.available === '1' && hasUnavailable;
  const active = Boolean(category || size || band || availableOnly);

  function set(key: keyof Raw, value: string | null) {
    // choosing the active one again clears it
    const next: Raw = { ...raw, [key]: value === null || raw[key] === value ? null : value };
    setRaw(next);
    writeAddress(next);
  }

  function clear() {
    setRaw(NONE);
    writeAddress(NONE);
  }

  const shown = artworks.filter(
    (a) =>
      (!category || a.category?.slug === category) &&
      (!size || a.size === size) &&
      (!band || inBand(a, band)) &&
      (!availableOnly || a.status === 'available'),
  );

  const money = (minor: number) => formatPrice(locale, minor, PRICE_BAND_CURRENCY);
  const bandLabel = (b: PriceBand) =>
    b.min === undefined
      ? fmt(f.under ?? '', { amount: money(b.max!) })
      : b.max === undefined
        ? fmt(f.over ?? '', { amount: money(b.min) })
        : fmt(f.between ?? '', { from: money(b.min), to: money(b.max) });

  const showFilters = categories.length > 1 || sizes.length > 1 || bands.length > 0 || hasUnavailable;

  return (
    <div>
      {showFilters ? (
        <section aria-label={f.label} className="mb-12 space-y-3 border-b border-hairline pb-8">
          {categories.length > 1 ? (
            <Group id="f-category" label={f.category}>
              <Chip active={!category} onClick={() => set('category', null)}>
                {f.all}
              </Chip>
              {categories.map((c) => (
                <Chip key={c.slug} active={category === c.slug} onClick={() => set('category', c.slug)}>
                  {c.name}
                </Chip>
              ))}
            </Group>
          ) : null}

          {sizes.length > 1 ? (
            <Group id="f-size" label={f.size}>
              <Chip active={!size} onClick={() => set('size', null)}>
                {f.all}
              </Chip>
              {sizes.map((s: SizeClass) => (
                <Chip key={s} active={size === s} onClick={() => set('size', s)}>
                  {f[s]}
                </Chip>
              ))}
            </Group>
          ) : null}

          {bands.length > 0 ? (
            <Group id="f-price" label={f.price ?? ''}>
              <Chip active={!band} onClick={() => set('price', null)}>
                {f.all}
              </Chip>
              {bands.map((b) => (
                <Chip key={b.id} active={band?.id === b.id} onClick={() => set('price', b.id)}>
                  {bandLabel(b)}
                </Chip>
              ))}
            </Group>
          ) : null}

          {hasUnavailable ? (
            <Group id="f-availability" label={f.availability}>
              <Chip active={availableOnly} onClick={() => set('available', '1')}>
                {f.availableOnly}
              </Chip>
            </Group>
          ) : null}

          <div className="flex min-h-[44px] flex-wrap items-center gap-x-6 gap-y-1 pt-1 md:pl-[8.25rem]">
            <p aria-live="polite" className="text-sm text-stone">
              {active ? fmt(f.showing, { shown: shown.length, total: artworks.length }) : ''}
            </p>
            {active ? (
              <button type="button" className="link min-h-[44px] text-[0.95rem]" onClick={clear}>
                {f.clear}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {shown.length > 0 ? (
        <ArtworkGrid artworks={shown} locale={locale} t={t.label} />
      ) : (
        <div className="py-8">
          <p className="text-stone">{f.none}</p>
          <button type="button" className="btn mt-4" onClick={clear}>
            {f.clear}
          </button>
        </div>
      )}
    </div>
  );
}
