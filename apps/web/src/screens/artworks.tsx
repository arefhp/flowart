import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { ArtworkGrid } from '@/components/site/ArtworkGrid';
import { ArtworkLabel } from '@/components/site/ArtworkLabel';
import { ArtworkViewer } from '@/components/site/ArtworkViewer';
import { JsonLd } from '@/components/site/JsonLd';
import { SiteShell } from '@/components/site/SiteShell';
import { getDict } from '@/i18n/dictionary';
import { getArtwork, getArtworks } from '@/lib/api';
import { SITE_NAME } from '@/lib/config';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import { excerpt, paragraphs } from '@/lib/text';

export function artworksMetadata(locale: Locale) {
  const t = getDict(locale);
  return pageMetadata({ locale, path: '/artworks', title: t.meta.artworksTitle, description: t.tagline });
}

export async function ArtworksScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const artworks = await getArtworks(locale);
  return (
    <SiteShell locale={locale} path="/artworks">
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        <h1 className="mb-12 text-[clamp(2.2rem,5vw,3.6rem)]">{t.artworksPage.title}</h1>
        {artworks.length > 0 ? (
          <ArtworkGrid artworks={artworks} locale={locale} t={t} />
        ) : (
          <p className="text-stone">{t.artworksPage.empty}</p>
        )}
      </main>
    </SiteShell>
  );
}

export async function artworkMetadata(locale: Locale, slug: string) {
  const a = await getArtwork(slug, locale);
  const cover = a.images[0]!;
  return pageMetadata({
    locale,
    path: `/artworks/${slug}`,
    title: a.title,
    description: excerpt(a.description) || a.medium || getDict(locale).tagline,
    image: `${cover.url}-1920.webp`,
  });
}

export async function ArtworkScreen({ locale, slug }: { locale: Locale; slug: string }) {
  const t = getDict(locale);
  const a = await getArtwork(slug, locale);
  const text = paragraphs(a.description);

  return (
    <SiteShell locale={locale} path={`/artworks/${slug}`}>
      {/* VisualArtwork: never any price or offer data (the price may be unset, and works are not sold at checkout) */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'VisualArtwork',
          name: a.title,
          url: absoluteUrl(locale, `/artworks/${slug}`),
          image: a.images.map((i) => `${i.url}-1920.webp`),
          creator: { '@type': 'Person', name: SITE_NAME },
          ...(a.description ? { description: a.description } : {}),
          ...(a.medium ? { artMedium: a.medium } : {}),
          ...(a.year ? { dateCreated: String(a.year) } : {}),
          ...(a.dimensions?.width_cm ? { width: { '@type': 'Distance', name: `${a.dimensions.width_cm} cm` } } : {}),
          ...(a.dimensions?.height_cm ? { height: { '@type': 'Distance', name: `${a.dimensions.height_cm} cm` } } : {}),
        }}
      />
      <main className="mx-auto max-w-[88rem] px-6 pt-4 md:px-10">
        <p className="mb-6 text-[0.95rem]">
          <Link href={localePath(locale, '/artworks')} className="link text-stone">
            {t.artworksPage.title}
          </Link>
        </p>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-20">
          <ArtworkViewer
            images={a.images}
            title={a.title}
            t={{
              viewLarge: t.artwork.viewLarge,
              imagesLabel: t.artwork.imagesLabel,
              imageOf: t.artwork.imageOf,
              close: t.artwork.close,
              prev: t.artwork.prev,
              next: t.artwork.next,
            }}
          />
          <div className="lg:pt-2">
            <ArtworkLabel artwork={a} locale={locale} t={t} headingLevel="h1" />
            {text.length > 0 ? (
              <div className="prose-artist mt-10 !text-[1.15rem]">
                {text.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : null}
            {a.status !== 'sold' ? (
              <p className="mt-12">
                <Link href={`${localePath(locale, '/contact')}?artwork=${encodeURIComponent(slug)}`} className="btn btn-primary">
                  {t.artwork.ask}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
