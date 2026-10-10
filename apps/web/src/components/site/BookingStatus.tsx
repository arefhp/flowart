'use client';

import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmt, formatPrice, type Dict } from '@/i18n/dictionary';
import { formatEventDate, formatEventTimes } from '@/lib/event-format';

interface BookingInfo {
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  reference: string;
  participants: number;
  amountMinor: number;
  currency: string;
  emailHint: string;
  event: { slug: string; title: string; startsAt: string; endsAt: string; timezone: string; location?: string };
}

type View = { kind: 'loading' } | { kind: 'missing' } | { kind: 'booking'; info: BookingInfo; slow: boolean };

const FAST_POLL_MS = 2000;
const SLOW_AFTER_MS = 40_000;
const GIVE_UP_AFTER_MS = 10 * 60_000;

/**
 * The page a customer lands on after the payment page. It NEVER decides a booking is paid: it only
 * asks the server for the booking's status, which changes when Stripe's webhook has arrived. While
 * the payment is still being confirmed it keeps asking, politely.
 */
export function BookingStatusView({ locale, t, mode }: { locale: Locale; t: Dict['booking']; mode: 'success' | 'cancelled' }) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setView({ kind: 'missing' });
      return;
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(token!)}?lang=${locale}`, { cache: 'no-store' });
        if (!current) return;
        if (res.status === 404) {
          setView({ kind: 'missing' });
          return;
        }
        if (res.ok) {
          const info = (await res.json()) as BookingInfo;
          if (!current) return;
          const elapsed = Date.now() - started;
          setView({ kind: 'booking', info, slow: elapsed > SLOW_AFTER_MS });
          // keep asking only while the payment is still being confirmed on the success page
          if (mode === 'success' && info.status === 'pending' && elapsed < GIVE_UP_AFTER_MS) {
            timer = setTimeout(poll, elapsed > SLOW_AFTER_MS ? 8000 : FAST_POLL_MS);
          }
          return;
        }
      } catch {
        // a hiccup in the network: try again below
      }
      if (current && Date.now() - started < GIVE_UP_AFTER_MS) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      current = false;
      if (timer) clearTimeout(timer);
    };
  }, [locale, mode]);

  const workshopLink = (slug?: string) => (
    <p className="mt-8 flex flex-wrap gap-x-8 gap-y-2">
      {slug ? (
        <Link href={localePath(locale, `/workshops/${slug}`)} className="link">
          {t.backToWorkshop}
        </Link>
      ) : null}
      <Link href={localePath(locale, '/workshops')} className="link">
        {t.allWorkshops}
      </Link>
    </p>
  );

  if (view.kind === 'loading') {
    return (
      <p role="status" className="text-stone">
        {t.working}
      </p>
    );
  }
  if (view.kind === 'missing') {
    return (
      <div role="status">
        <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{t.notFoundTitle}</h1>
        <p className="prose-artist mt-6 text-stone">{t.notFoundBody}</p>
        {workshopLink()}
      </div>
    );
  }

  const { info, slow } = view;
  const e = info.event;
  const total = info.amountMinor === 0 ? '' : formatPrice(locale, info.amountMinor, info.currency);

  const details = (
    <dl className="mt-8 max-w-md border-t border-ink">
      {[
        [t.workshop, e.title],
        [t.date, formatEventDate(e.startsAt, e.timezone, locale)],
        [t.time, formatEventTimes(e.startsAt, e.endsAt, e.timezone, locale)],
        [t.places, String(info.participants)],
        ...(total ? [[t.totalLabel, total]] : []),
        [t.reference, info.reference],
      ].map(([k, v]) => (
        <div key={k} className="grid grid-cols-[8rem_1fr] gap-x-4 border-b border-hairline py-3">
          <dt className="text-stone">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );

  if (info.status === 'confirmed') {
    return (
      <div role="status">
        <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{t.confirmedTitle}</h1>
        <p className="prose-artist mt-6">{fmt(t.confirmedBody, { email: info.emailHint })}</p>
        {details}
        {workshopLink(e.slug)}
      </div>
    );
  }

  if (info.status === 'pending') {
    // success page: the payment is still being confirmed. cancelled page: the customer went back.
    if (mode === 'cancelled') {
      return (
        <div role="status">
          <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{t.paymentCancelledTitle}</h1>
          <p className="prose-artist mt-6 text-stone">{t.paymentCancelledBody}</p>
          {workshopLink(e.slug)}
        </div>
      );
    }
    return (
      <div role="status" aria-live="polite">
        <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{slow ? t.slowTitle : t.waitingTitle}</h1>
        <p className="prose-artist mt-6 text-stone">{slow ? t.slowBody : t.waitingBody}</p>
        {details}
      </div>
    );
  }

  if (info.status === 'cancelled') {
    return (
      <div role="status">
        <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{t.cancelledTitle}</h1>
        <p className="prose-artist mt-6 text-stone">{t.cancelledBody}</p>
        {workshopLink(e.slug)}
      </div>
    );
  }

  // expired
  return (
    <div role="status">
      <h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{mode === 'cancelled' ? t.paymentCancelledTitle : t.expiredTitle}</h1>
      <p className="prose-artist mt-6 text-stone">{t.expiredBody}</p>
      {workshopLink(e.slug)}
    </div>
  );
}
