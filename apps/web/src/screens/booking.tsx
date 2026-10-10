import type { Locale } from '@flowart/shared';
import { BookingStatusView } from '@/components/site/BookingStatus';
import { SiteShell } from '@/components/site/SiteShell';
import { getDict } from '@/i18n/dictionary';
import { pageMetadata } from '@/lib/seo';

export type BookingPage = 'success' | 'cancelled';

/** These pages belong to one person's booking: not indexed, not in the sitemap. */
export function bookingMetadata(locale: Locale, page: BookingPage) {
  const t = getDict(locale).booking;
  return {
    ...pageMetadata({ locale, path: `/booking/${page}`, title: page === 'success' ? t.confirmedTitle : t.paymentCancelledTitle, noAlternates: true }),
    robots: { index: false, follow: false },
  };
}

export function BookingScreen({ locale, page }: { locale: Locale; page: BookingPage }) {
  const t = getDict(locale);
  return (
    <SiteShell locale={locale} path={`/booking/${page}`}>
      <main className="mx-auto max-w-[88rem] px-6 pt-10 md:px-10">
        <BookingStatusView locale={locale} t={t.booking} mode={page} />
      </main>
    </SiteShell>
  );
}
