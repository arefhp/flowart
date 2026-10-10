import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import type { ArtworkListItem } from '@/lib/types';
import { ArtworkLabel, type LabelStrings } from './ArtworkLabel';
import { Picture } from './Picture';

/**
 * The gallery wall: ONE cover image per artwork, shown in its true proportions (no identical
 * cards), with the wall label beneath. Clicking opens the artwork page with every image.
 */
export function ArtworkGrid({
  artworks,
  locale,
  t,
  className = 'columns-1 gap-x-12 sm:columns-2 xl:columns-3',
}: {
  artworks: ArtworkListItem[];
  locale: Locale;
  t: LabelStrings;
  /** the column layout (the filtered gallery has less room because of its sidebar) */
  className?: string;
}) {
  return (
    <ul className={className}>
      {artworks.map((a, index) => (
        <li key={a.slug} className="mb-16 break-inside-avoid">
          <Link href={localePath(locale, `/artworks/${a.slug}`)} className="group block">
            <Picture
              image={a.cover}
              priority={index < 2}
              sizes="(min-width: 1280px) 28vw, (min-width: 640px) 44vw, 92vw"
              className="transition-opacity duration-200 group-hover:opacity-90"
            />
            <div className="mt-3">
              <ArtworkLabel artwork={a} locale={locale} t={t} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
