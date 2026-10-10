'use client';

import { SIZE_CLASSES, type Locale, type SizeClass } from '@flowart/shared';
import { useEffect, useMemo, useState } from 'react';
import { fmt, formatPrice, type Dict } from '@/i18n/dictionary';
import { PRICE_BAND_CURRENCY, SHOW_PRICE_FILTER, inBand, usableBands, type PriceBand } from '@/lib/price-bands';
import type { ArtworkListItem, PublicCategory } from '@/lib/types';
import { ArtworkGrid } from './ArtworkGrid';
import type { LabelStrings } from './ArtworkLabel';

/** Only the strings this component needs are passed in, not the whole dictionary. */
export type PriceStrings = Pick<Dict['filters'], 'price' | 'under' | 'between' | 'over'>;
export type BrowserStrings = {
  /** the price wording is left out entirely while the price filter is not shown */
  filters: Omit<Dict['filters'], keyof PriceStrings> & Partial<PriceStrings>;
  label: LabelStrings;
};

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

/** One choice in the sidebar: a quiet text row, the active one marked with a bar and heavier type. */
function Option({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[44px] w-full items-center justify-between gap-3 border-l-2 pl-4 pr-1 text-left text-[0.98rem] transition-colors ${
        active ? 'border-ink font-medium text-ink' : 'border-transparent text-stone hover:border-hairline hover:text-ink'
      }`}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <span aria-hidden="true" className="text-sm tabular-nums text-stone/80">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Group({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="border-t border-hairline pt-4">
      <h3 id={id} className="mb-1 font-sans text-[0.8rem] font-medium tracking-wide text-ink">
        {label}
      </h3>
      <div>{children}</div>
    </div>
  );
}

/**
 * The gallery with a filter sidebar: category, size, "available only" (and a price range, which is
 * built but switched off for now, see SHOW_PRICE_FILTER). Size always offers Small, Medium and
 * Large. On a phone the sidebar folds away behind a "Filters" button. The choices live in the
 * address (?category=resin&size=small), so a filtered view can be shared. The page is built with
 * EVERY artwork in the HTML (good for search engines and visitors without JavaScript); the choices
 * from the address are applied once it loads.
 */
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
  const [open, setOpen] = useState(false); // the phone's "Filters" panel
  const f = t.filters;

  // apply the choices in the address after load, and follow the browser's back/forward buttons
  useEffect(() => {
    const sync = () => setRaw(readAddress());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const bands = useMemo(() => (SHOW_PRICE_FILTER ? usableBands(artworks) : []), [artworks]);
  const hasUnavailable = artworks.some((a) => a.status !== 'available') && artworks.some((a) => a.status === 'available');

  // read the choices from the address; anything that is not a real option is ignored
  const category = categories.find((c) => c.slug === raw.category)?.slug ?? null;
  const size = SIZE_CLASSES.find((s) => s === raw.size) ?? null;
  const band: PriceBand | null = bands.find((b) => b.id === raw.price) ?? null;
  const availableOnly = raw.available === '1' && hasUnavailable;
  const activeCount = [category, size, band, availableOnly].filter(Boolean).length;
  const active = activeCount > 0;

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

  const sizeCount = (s: SizeClass) => artworks.filter((a) => a.size === s).length;
  const showCategories = categories.length > 1;

  return (
    <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside aria-label={f.label} className="lg:sticky lg:top-6 lg:self-start">
        {/* phone: the filters fold away */}
        <button
          type="button"
          className="btn w-full justify-between lg:hidden"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <span>{f.title}</span>
          <span className="text-stone">{active ? activeCount : ''}</span>
        </button>

        <div id="filter-panel" className={`${open ? 'block' : 'hidden'} mt-4 space-y-5 lg:mt-0 lg:block`}>
          <div className="hidden items-baseline justify-between lg:flex">
            <h2 className="font-serif text-2xl">{f.title}</h2>
            {active ? (
              <button type="button" className="link min-h-[44px] text-[0.95rem]" onClick={clear}>
                {f.clear}
              </button>
            ) : null}
          </div>

          {showCategories ? (
            <Group id="f-category" label={f.category}>
              <Option active={!category} onClick={() => set('category', null)} count={artworks.length}>
                {f.all}
              </Option>
              {categories.map((c) => (
                <Option key={c.slug} active={category === c.slug} onClick={() => set('category', c.slug)} count={c.count}>
                  {c.name}
                </Option>
              ))}
            </Group>
          ) : null}

          <Group id="f-size" label={f.size}>
            <Option active={!size} onClick={() => set('size', null)} count={artworks.length}>
              {f.all}
            </Option>
            {SIZE_CLASSES.map((s) => (
              <Option key={s} active={size === s} onClick={() => set('size', s)} count={sizeCount(s)}>
                {f[s]}
              </Option>
            ))}
          </Group>

          {bands.length > 0 ? (
            <Group id="f-price" label={f.price ?? ''}>
              <Option active={!band} onClick={() => set('price', null)}>
                {f.all}
              </Option>
              {bands.map((b) => (
                <Option key={b.id} active={band?.id === b.id} onClick={() => set('price', b.id)}>
                  {bandLabel(b)}
                </Option>
              ))}
            </Group>
          ) : null}

          {hasUnavailable ? (
            <Group id="f-availability" label={f.availability}>
              <Option active={availableOnly} onClick={() => set('available', '1')}>
                {f.availableOnly}
              </Option>
            </Group>
          ) : null}

          <div className="min-h-[1.5rem] border-t border-hairline pt-4">
            <p aria-live="polite" className="text-sm text-stone">
              {active ? fmt(f.showing, { shown: shown.length, total: artworks.length }) : ''}
            </p>
            {active ? (
              <button type="button" className="link min-h-[44px] text-[0.95rem] lg:hidden" onClick={clear}>
                {f.clear}
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <div>
        {shown.length > 0 ? (
          <ArtworkGrid artworks={shown} locale={locale} t={t.label} className="columns-1 gap-x-10 sm:columns-2 2xl:columns-3" />
        ) : (
          <div className="py-4">
            <p className="text-stone">{f.none}</p>
            <button type="button" className="btn mt-4" onClick={clear}>
              {f.clear}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
