import type { Locale } from '@flowart/shared';
import { formatPrice, intlLocale, type Dict } from '@/i18n/dictionary';
import { formatDimensions } from '@/lib/text';
import type { ArtworkDetail, ArtworkListItem } from '@/lib/types';

type Labelled = Pick<ArtworkListItem, 'title' | 'status' | 'medium' | 'price_minor' | 'currency'> &
  Partial<Pick<ArtworkDetail, 'year' | 'dimensions'>>;

/**
 * The museum wall label: title, then the facts. Rows exist only for facts that exist, and the
 * price appears ONLY when the artwork has one: no label, dash, "N/A" or empty container otherwise.
 */
export function ArtworkLabel({
  artwork,
  locale,
  t,
  headingLevel,
}: {
  artwork: Labelled;
  locale: Locale;
  t: Dict;
  headingLevel?: 'h1' | 'h2' | 'p';
}) {
  const size = formatDimensions(intlLocale[locale], artwork.dimensions);
  const Title = headingLevel ?? 'p';
  const hasPrice = artwork.price_minor !== undefined && artwork.currency !== undefined;
  return (
    <div className="wall-label">
      <Title className={headingLevel === 'h1' ? 'title !text-[2rem] !leading-tight !font-normal' : 'title'}>{artwork.title}</Title>
      <dl>
        {artwork.medium ? (
          <div>
            <dt className="sr-only">{t.artwork.medium}</dt>
            <dd>{artwork.medium}</dd>
          </div>
        ) : null}
        {size ? (
          <div>
            <dt className="sr-only">{t.artwork.size}</dt>
            <dd>{size}</dd>
          </div>
        ) : null}
        {artwork.year ? (
          <div>
            <dt className="sr-only">{t.artwork.year}</dt>
            <dd>{artwork.year}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t.artwork.statusLabel}</dt>
          <dd>{t.status[artwork.status]}</dd>
        </div>
        {hasPrice ? (
          <div>
            <dt className="sr-only">{t.artwork.priceLabel}</dt>
            <dd>{formatPrice(locale, artwork.price_minor!, artwork.currency!)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
