import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { CalendarView } from '@/components/site/CalendarView';
import { EventLive } from '@/components/site/EventLive';
import { EventsList } from '@/components/site/EventsList';
import { JsonLd } from '@/components/site/JsonLd';
import { SiteShell } from '@/components/site/SiteShell';
import { getDict } from '@/i18n/dictionary';
import { getEvent, getEvents } from '@/lib/api';
import { SITE_NAME } from '@/lib/config';
import { formatEventDate, formatEventPrice, formatEventTimes } from '@/lib/event-format';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import { excerpt, paragraphs } from '@/lib/text';

/** The time the page was built; the browser switches to the real clock after loading. */
const builtAtMs = () => Date.now();

export function workshopsMetadata(locale: Locale) {
  const t = getDict(locale);
  return pageMetadata({ locale, path: '/workshops', title: t.meta.workshopsTitle, description: t.events.intro });
}

export async function WorkshopsScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const events = await getEvents(locale);
  return (
    <SiteShell locale={locale} path="/workshops">
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        <h1 className="mb-4 text-[clamp(2.2rem,5vw,3.6rem)]">{t.events.title}</h1>
        <p className="prose-artist mb-14 text-stone">{t.events.intro}</p>
        <EventsList events={events} locale={locale} t={t.events} builtAtMs={builtAtMs()} />
        <p className="mt-12">
          <Link href={localePath(locale, '/calendar')} className="link">
            {t.nav.calendar}
          </Link>
        </p>
      </main>
    </SiteShell>
  );
}

export function calendarMetadata(locale: Locale) {
  const t = getDict(locale);
  return pageMetadata({ locale, path: '/calendar', title: t.meta.calendarTitle, description: t.events.calendarIntro });
}

export async function CalendarScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const events = await getEvents(locale);
  return (
    <SiteShell locale={locale} path="/calendar">
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        <h1 className="mb-4 text-[clamp(2.2rem,5vw,3.6rem)]">{t.events.calendarTitle}</h1>
        <p className="prose-artist mb-10 text-stone">{t.events.calendarIntro}</p>
        <CalendarView events={events} locale={locale} t={t.events} builtAtMs={builtAtMs()} />
      </main>
    </SiteShell>
  );
}

export async function eventMetadata(locale: Locale, slug: string) {
  const e = await getEvent(slug, locale);
  const t = getDict(locale);
  return pageMetadata({
    locale,
    path: `/workshops/${slug}`,
    title: e.title,
    description: excerpt(e.description) || `${formatEventDate(e.startsAt, e.timezone, locale)}, ${t.siteName}`,
  });
}

export async function EventScreen({ locale, slug }: { locale: Locale; slug: string }) {
  const t = getDict(locale);
  const e = await getEvent(slug, locale);
  const text = paragraphs(e.description);
  const cancelled = e.status === 'cancelled';
  const url = absoluteUrl(locale, `/workshops/${slug}`);

  return (
    <SiteShell locale={locale} path={`/workshops/${slug}`}>
      {/* Event with an offer (events, unlike artworks, always have a price). Capacity is deliberately
          not claimed here: availability is live and never baked into a static page. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: e.title,
          url,
          startDate: e.startsAt,
          endDate: e.endsAt,
          eventStatus: cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          ...(e.description ? { description: e.description } : {}),
          ...(e.location ? { location: { '@type': 'Place', name: e.location, address: { '@type': 'PostalAddress', addressLocality: 'Copenhagen', addressCountry: 'DK' } } } : {}),
          organizer: { '@type': 'Person', name: SITE_NAME },
          offers: { '@type': 'Offer', url, price: String(e.priceMinor / 100), priceCurrency: e.currency },
        }}
      />
      <main className="mx-auto max-w-[88rem] px-6 pt-4 md:px-10">
        <p className="mb-6 flex flex-wrap gap-x-6 text-[0.95rem]">
          <Link href={localePath(locale, '/workshops')} className="link text-stone">
            {t.events.allWorkshops}
          </Link>
          <Link href={localePath(locale, '/calendar')} className="link text-stone">
            {t.nav.calendar}
          </Link>
        </p>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:gap-20">
          <article>
            <h1 className={`text-[clamp(2.2rem,5vw,3.6rem)] ${cancelled ? 'line-through decoration-stone' : ''}`}>{e.title}</h1>
            {text.length > 0 ? (
              <div className="prose-artist mt-8 !text-[1.15rem]">
                {text.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : null}
          </article>

          <aside className="lg:pt-3">
            <dl className="border-t border-ink">
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-b border-hairline py-4">
                <dt className="text-stone">{t.events.date}</dt>
                <dd>{formatEventDate(e.startsAt, e.timezone, locale)}</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-b border-hairline py-4">
                <dt className="text-stone">{t.events.time}</dt>
                <dd>
                  {formatEventTimes(e.startsAt, e.endsAt, e.timezone, locale)} <span className="text-stone">({t.events.timeZoneNote})</span>
                </dd>
              </div>
              {e.location ? (
                <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-b border-hairline py-4">
                  <dt className="text-stone">{t.events.location}</dt>
                  <dd>{e.location}</dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-b border-hairline py-4">
                <dt className="text-stone">{t.events.price}</dt>
                <dd>{formatEventPrice(e, locale, t.events)}</dd>
              </div>
            </dl>

            <div className="mt-8">
              <EventLive event={e} locale={locale} t={t.events} builtAtMs={builtAtMs()} />
            </div>

            {!cancelled ? (
              <p className="mt-8">
                <a className="link" href={`/api/events/${encodeURIComponent(slug)}/ics?lang=${locale}`} download>
                  {t.events.addToCalendar}
                </a>
              </p>
            ) : null}
          </aside>
        </div>
      </main>
    </SiteShell>
  );
}
