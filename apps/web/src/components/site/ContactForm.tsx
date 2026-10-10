'use client';

import type { Locale } from '@flowart/shared';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fmt, type Dict } from '@/i18n/dictionary';
import { formatEventDate } from '@/lib/event-format';
import { useTurnstile } from './use-turnstile';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/**
 * Contact form. Opens pre-filled when the visitor arrives from "Ask about this work"
 * (`?artwork=slug`). Spam protection is Cloudflare Turnstile, verified again on the server.
 */
/** Only the strings this form needs are passed in, not the whole dictionary. */
export type ContactStrings = { contact: Dict['contact']; enquiryMessage: string; reserveMessage: string };

export function ContactForm({ locale, t }: { locale: Locale; t: ContactStrings }) {
  const params = useSearchParams();
  const artworkSlug = params.get('artwork');
  const eventSlug = params.get('event');
  const [artworkTitle, setArtworkTitle] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState('');
  const { token, state: humanState, widgetRef, reset: resetHuman, showWidget } = useTurnstile(locale);
  const prefilled = useRef(false);

  // look up the artwork the visitor asked about and pre-fill the message once
  useEffect(() => {
    if (!artworkSlug) return;
    let cancelled = false;
    fetch(`/api/artworks/${encodeURIComponent(artworkSlug)}?lang=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((a: { title?: string } | null) => {
        if (cancelled || !a?.title) return;
        setArtworkTitle(a.title);
        if (!prefilled.current) {
          prefilled.current = true;
          setMessage((m) => (m ? m : fmt(t.enquiryMessage, { title: a.title! })));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [artworkSlug, locale, t.enquiryMessage]);

  // a visitor who arrives from a workshop page (?event=slug): name it and pre-fill the message once
  useEffect(() => {
    if (!eventSlug) return;
    let cancelled = false;
    fetch(`/api/events/${encodeURIComponent(eventSlug)}?lang=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((e: { title?: string; startsAt?: string; timezone?: string } | null) => {
        if (cancelled || !e?.title || !e.startsAt) return;
        setEventTitle(e.title);
        if (!prefilled.current) {
          prefilled.current = true;
          const date = formatEventDate(e.startsAt, e.timezone ?? 'Europe/Copenhagen', locale);
          setMessage((m) => (m ? m : fmt(t.reserveMessage, { title: e.title!, date })));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventSlug, locale, t.reserveMessage]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t.contact.nameRequired;
    if (!EMAIL_RE.test(email.trim())) next.email = t.contact.emailInvalid;
    if (message.trim().length < 5) next.message = t.contact.messageShort;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;
    if (!token) {
      setFormError(humanState === 'failed' ? t.contact.humanFailed : t.contact.humanLoading);
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          locale,
          artworkSlug: artworkSlug || undefined,
          turnstileToken: token,
        }),
      });
      if (res.status === 201) {
        setStatus('sent');
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      setStatus('error');
      const code = body?.error?.code;
      setFormError(code === 'rate_limited' ? t.contact.rateLimited : code === 'turnstile_failed' ? t.contact.humanCheck : t.contact.error);
      if (code === 'turnstile_failed') resetHuman();
    } catch {
      setStatus('error');
      setFormError(t.contact.error);
    }
  }

  if (status === 'sent') {
    return (
      <p role="status" className="font-serif text-2xl">
        {t.contact.success}
      </p>
    );
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} className="mt-1 text-sm text-alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-6">
      {artworkTitle ? (
        <p className="wall-label">
          {t.contact.aboutArtwork}: <span className="title">{artworkTitle}</span>
        </p>
      ) : null}
      {eventTitle ? (
        <p className="wall-label">
          {t.contact.aboutWorkshop}: <span className="title">{eventTitle}</span>
        </p>
      ) : null}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm">
          {t.contact.name}
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'name-error' : undefined}
          maxLength={120}
        />
        {fieldError('name')}
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm">
          {t.contact.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          maxLength={254}
        />
        {fieldError('email')}
      </div>
      <div>
        <label htmlFor="message" className="mb-1 block text-sm">
          {t.contact.message}
        </label>
        <textarea
          id="message"
          name="message"
          rows={7}
          className="field resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? 'message-error' : undefined}
          maxLength={5000}
        />
        {fieldError('message')}
      </div>

      {showWidget ? <div ref={widgetRef} /> : null}

      {formError ? (
        <p role="alert" className="text-alert">
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
        {status === 'sending' ? t.contact.sending : t.contact.send}
      </button>
    </form>
  );
}
