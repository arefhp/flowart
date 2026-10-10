import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { ArtworkGrid } from '@/components/site/ArtworkGrid';
import { ArtworkLabel } from '@/components/site/ArtworkLabel';
import { EventsList } from '@/components/site/EventsList';
import { JsonLd } from '@/components/site/JsonLd';
import { Picture } from '@/components/site/Picture';
import { SiteShell } from '@/components/site/SiteShell';
import { getDict } from '@/i18n/dictionary';
import { getArtworks, getEvents, getSocial } from '@/lib/api';
import { SITE_NAME, SITE_URL } from '@/lib/config';
import { pageMetadata } from '@/lib/seo';

export function homeMetadata(locale: Locale) {
  const t = getDict(locale);
  return pageMetadata({ locale, path: '/', title: t.meta.homeTitle, description: t.tagline });
}

export async function HomeScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const [all, featured, social, events] = await Promise.all([
    getArtworks(locale),
    getArtworks(locale, { featured: true }),
    getSocial(),
    getEvents(locale),
  ]);
  const hero = featured[0] ?? all[0];
  const rest = all.filter((a) => a.slug !== hero?.slug).slice(0, 6);

  return (
    <SiteShell locale={locale} path="/">
      {/* The artist and her site, as a Person. `sameAs` lists only the visible social links. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: SITE_NAME,
          url: SITE_URL,
          jobTitle: 'Painter',
          ...(social.length ? { sameAs: social.map((s) => s.url) } : {}),
        }}
      />
      <main className="mx-auto max-w-[88rem] px-6 md:px-10">
        <section className="grid gap-10 pt-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-end lg:gap-16 lg:pt-10">
          {hero ? (
            <Link href={localePath(locale, `/artworks/${hero.slug}`)} className="group block lg:order-1">
              <Picture
                image={hero.cover}
                priority
                fit="height"
                sizes="(min-width: 1024px) 55vw, 92vw"
                className="max-h-[78vh] w-auto transition-opacity group-hover:opacity-90"
              />
            </Link>
          ) : null}
          <div className="lg:order-2 lg:pb-2">
            <h1 className="text-[clamp(2.6rem,6.2vw,4.8rem)]">{t.siteName}</h1>
            <p className="prose-artist mt-5 text-stone">{t.tagline}</p>
            {hero ? (
              <div className="mt-12">
                <ArtworkLabel artwork={hero} locale={locale} t={t} />
              </div>
            ) : (
              <p className="mt-10 text-stone">{t.home.empty}</p>
            )}
          </div>
        </section>

        {/* a short list of the next workshops; it hides itself when none are upcoming */}
        <EventsList events={events} locale={locale} t={t.events} builtAtMs={Date.now()} variant="home" limit={3} />

        {rest.length > 0 ? (
          <section aria-labelledby="recent" className="mt-28">
            <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
              <h2 id="recent" className="text-3xl">
                {t.home.recent}
              </h2>
              <Link href={localePath(locale, '/artworks')} className="link">
                {t.home.all}
              </Link>
            </div>
            <ArtworkGrid artworks={rest} locale={locale} t={t} />
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
