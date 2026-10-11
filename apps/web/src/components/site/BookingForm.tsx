'use client';

import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { fmt, formatPrice, type Dict } from '@/i18n/dictionary';
import { useTurnstile } from './use-turnstile';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export type BookingLabels = { terms: string; privacy: string };

interface Props {
  event: { slug: string; priceMinor: number; currency: string };
  locale: Locale;
  t: Dict['booking'];
  labels: BookingLabels;
  /** how many places can be chosen (already limited by places left and the per-booking maximum) */
  maxPlaces: number;
  holdMinutes: number;
  /** called when the server says the places changed, so the page can refresh its numbers; the message stays visible even if the form then goes away */
  onStale: (message: string) => void;
}

/**
 * Book a place. The total shown here is only a convenience: the server works out the real price from
 * the workshop, and Stripe's page shows the same amount again. The total and the free-cancellation
 * rule are shown BEFORE the pay button.
 */
export function BookingForm({ event, locale, t, labels, maxPlaces, holdMinutes, onStale }: Props) {
  const free = event.priceMinor === 0;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [participants, setParticipants] = useState(1);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const human = useTurnstile(locale);

  const places = Math.min(Math.max(1, participants), Math.max(1, maxPlaces));
  const total = formatPrice(locale, event.priceMinor * places, event.currency);

  function failure(code: string | undefined, remaining: number | undefined): string {
    switch (code) {
      case 'sold_out':
        return t.soldOut;
      case 'not_enough_places':
        return fmt(t.notEnough, { n: remaining ?? 0 });
      case 'event_closed':
      case 'event_started':
      case 'event_cancelled':
        return t.closed;
      case 'payments_not_configured':
        return t.paymentsOff;
      case 'payment_unavailable':
        return t.paymentFailed;
      case 'rate_limited':
        return t.rateLimited;
      case 'turnstile_failed':
        return t.humanCheck;
      default:
        return t.error;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t.nameRequired;
    if (!EMAIL_RE.test(email.trim())) next.email = t.emailInvalid;
    if (!consent) next.consent = t.consentRequired;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;
    if (!human.token) {
      setFormError(human.state === 'failed' ? t.humanFailed : t.humanLoading);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(event.slug)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          participants: places,
          locale,
          consent: true,
          turnstileToken: human.token,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        bookingToken?: string;
        checkoutUrl?: string;
        confirmed?: boolean;
        error?: { code?: string; details?: { remaining?: number } };
      } | null;
      if (res.status === 201 && body?.bookingToken) {
        setLeaving(true);
        // paid: off to Stripe's secure page; free: straight to the confirmation page
        window.location.assign(body.checkoutUrl ?? `${localePath(locale, '/booking/success')}?token=${encodeURIComponent(body.bookingToken)}`);
        return;
      }
      const code = body?.error?.code;
      const message = failure(code, body?.error?.details?.remaining);
      setFormError(message);
      if (code === 'sold_out' || code === 'not_enough_places' || code?.startsWith('event_')) onStale(message);
      if (code === 'turnstile_failed') human.reset();
    } catch {
      setFormError(t.error);
    }
    setBusy(false);
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`booking-${key}-error`} className="mt-1 text-sm text-alert">
        {errors[key]}
      </p>
    ) : null;

  // "I have read the {terms} and the {privacy}." with the two names as links
  const consentText = t.consent.split(/(\{terms\}|\{privacy\})/).map((part, i) => {
    if (part === '{terms}' || part === '{privacy}') {
      const path = part === '{terms}' ? '/terms' : '/privacy';
      return (
        <Link key={i} href={localePath(locale, path)} target="_blank" className="link">
          {part === '{terms}' ? labels.terms : labels.privacy}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-labelledby="booking-heading">
      <h2 id="booking-heading" className="font-serif text-2xl">
        {t.title}
      </h2>

      <div>
        <label htmlFor="booking-name" className="mb-1 block text-sm">
          {t.name}
        </label>
        <input
          id="booking-name"
          autoComplete="name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'booking-name-error' : undefined}
          maxLength={120}
        />
        {fieldError('name')}
      </div>

      <div>
        <label htmlFor="booking-email" className="mb-1 block text-sm">
          {t.email}
        </label>
        <input
          id="booking-email"
          type="email"
          autoComplete="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'booking-email-error' : 'booking-email-note'}
          maxLength={254}
        />
        <p id="booking-email-note" className="mt-1 text-sm text-stone">
          {t.emailNote}
        </p>
        {fieldError('email')}
      </div>

      <div>
        <label htmlFor="booking-phone" className="mb-1 block text-sm">
          {t.phone}
        </label>
        <input id="booking-phone" type="tel" autoComplete="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
      </div>

      <div>
        <label htmlFor="booking-participants" className="mb-1 block text-sm">
          {t.participants}
        </label>
        <select id="booking-participants" className="field" value={places} onChange={(e) => setParticipants(Number(e.target.value))}>
          {Array.from({ length: Math.max(1, maxPlaces) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? t.onePlace : fmt(t.nPlaces, { n })}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-hairline pt-5">
        {free ? (
          <p>{t.freeNote}</p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-baseline justify-between gap-4 text-lg">
              <span>{t.total}</span>
              <strong data-testid="booking-total" className="font-medium">
                {total}
              </strong>
            </p>
            <p className="text-sm text-stone">{fmt(t.holdNote, { minutes: holdMinutes })}</p>
            <p className="text-sm" data-testid="cancel-notice">
              {t.cancelNotice}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? 'booking-consent-error' : undefined}
          />
          <span>{consentText}</span>
        </label>
        {fieldError('consent')}
      </div>

      {human.showWidget ? <div ref={human.widgetRef} /> : null}

      {formError ? (
        <p role="alert" className="text-alert">
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {leaving ? t.goingToPayment : busy ? t.working : free ? t.freeButton : fmt(t.payButton, { amount: total })}
      </button>
    </form>
  );
}
