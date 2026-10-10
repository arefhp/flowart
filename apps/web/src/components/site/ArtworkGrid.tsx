import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import type { ArtworkListItem } from '@/lib/types';
import { ArtworkLabel, type LabelStrings } from './ArtworkLabel';
import { Picture } from './Picture';

/**
 * The gallery wall: ONE cover image per artwork with the wall label beneath. Every tile has the same
 * frame (4:5), and the image is shown WHOLE inside it, never cropped, on a pale mat, so rows and labels
 * line up whatever the proportions of each work. Clicking opens the artwork page with every image.
 */
export function ArtworkGrid({
  artworks,
  locale,
  t,
  className = 'grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 xl:grid-cols-3',
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
        <li key={a.slug}>
          <Link href={localePath(locale, `/artworks/${a.slug}`)} className="group block">
            <div className="aspect-[4/5] bg-hairline/40 p-3 transition-colors group-hover:bg-hairline/70">
              <Picture
                image={a.cover}
                fit="contain"
                priority={index < 2}
                sizes="(min-width: 1280px) 28vw, (min-width: 640px) 44vw, 92vw"
              />
            </div>
            <div className="mt-3">
              <ArtworkLabel artwork={a} locale={locale} t={t} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
