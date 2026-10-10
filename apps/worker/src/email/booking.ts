import { formatEventDate, formatEventTimes, formatMoney, localePath, pickText, type Locale } from '@flowart/shared';
import { siteOrigin } from '../config';
import type { Env } from '../env';
import { stripControl } from '../lib/http';
import { buildIcs } from '../lib/ics';
import { escapeHtml, type Attachment, type QueuedEmail } from './index';

/** The parts of a booking and its workshop the emails need. */
export interface BookingMailData {
  booking: {
    id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    locale: Locale;
    number_of_participants: number;
    amount_minor: number;
    currency: string;
  };
  event: {
    id: string;
    slug: string;
    title: string;
    title_da: string | null;
    description: string | null;
    description_da: string | null;
    location: string | null;
    location_da: string | null;
    starts_at: string;
    ends_at: string;
    timezone: string;
    updated_at: string;
  };
}

export const bookingRef = (id: string) => id.slice(0, 8).toUpperCase();

interface Strings {
  confirmedSubject: (t: string) => string;
  hi: (n: string) => string;
  confirmedIntro: string;
  workshop: string;
  date: string;
  time: string;
  where: string;
  places: string;
  total: string;
  free: string;
  paid: string;
  reference: string;
  calendar: string;
  cancelPolicy: string;
  seeYou: string;
  cancelledSubject: (t: string) => string;
  cancelledByUs: (t: string) => string;
  cancelledAtRequest: (t: string) => string;
  refundLine: (amount: string) => string;
  refundPending: string;
  noPayment: string;
  sorry: string;
  lateSubject: (t: string) => string;
  lateBody: (t: string) => string;
  signoff: string;
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    confirmedSubject: (t) => `Your place at ${t} is booked`,
    hi: (n) => `Hi ${n},`,
    confirmedIntro: 'Thank you for booking. Your place is confirmed. Here are the details:',
    workshop: 'Workshop',
    date: 'Date',
    time: 'Time',
    where: 'Where',
    places: 'Places',
    total: 'Total',
    free: 'Free',
    paid: 'paid',
    reference: 'Booking reference',
    calendar: 'A calendar file is attached, so you can add the workshop to your calendar.',
    cancelPolicy: 'If you need to cancel, reply to this email at least 24 hours before the workshop starts and we will refund you in full.',
    seeYou: 'See you soon!',
    cancelledSubject: (t) => `Your booking for ${t} is cancelled`,
    cancelledByUs: (t) => `We are sorry, but we have had to cancel the workshop "${t}".`,
    cancelledAtRequest: (t) => `Your booking for "${t}" has been cancelled, as agreed.`,
    refundLine: (a) => `We have refunded ${a} to the card you paid with. Depending on your bank it can take a few days to show up.`,
    refundPending: 'Your refund is on its way.',
    noPayment: 'You did not pay anything for this booking.',
    sorry: 'Sorry for the trouble. You are always welcome to write to us.',
    lateSubject: (t) => `Your payment for ${t} has been refunded`,
    lateBody: (t) =>
      `Your payment for "${t}" reached us after the places we were holding for you had been released, and the workshop could no longer take your booking.`,
    signoff: 'Zakereh Art',
  },
  da: {
    confirmedSubject: (t) => `Din plads til ${t} er booket`,
    hi: (n) => `Hej ${n},`,
    confirmedIntro: 'Tak for din booking. Din plads er bekræftet. Her er detaljerne:',
    workshop: 'Workshop',
    date: 'Dato',
    time: 'Tidspunkt',
    where: 'Sted',
    places: 'Pladser',
    total: 'I alt',
    free: 'Gratis',
    paid: 'betalt',
    reference: 'Bookingreference',
    calendar: 'Der er vedhæftet en kalenderfil, så du kan lægge workshoppen ind i din kalender.',
    cancelPolicy: 'Hvis du skal afbestille, så svar på denne mail senest 24 timer før workshoppen starter, så får du pengene tilbage.',
    seeYou: 'Vi ses!',
    cancelledSubject: (t) => `Din booking til ${t} er aflyst`,
    cancelledByUs: (t) => `Vi er kede af det, men vi har måttet aflyse workshoppen "${t}".`,
    cancelledAtRequest: (t) => `Din booking til "${t}" er aflyst, som aftalt.`,
    refundLine: (a) => `Vi har refunderet ${a} til det kort, du betalte med. Afhængigt af din bank kan der gå nogle dage, før det vises.`,
    refundPending: 'Din refusion er på vej.',
    noPayment: 'Du har ikke betalt noget for denne booking.',
    sorry: 'Undskyld ulejligheden. Du er altid velkommen til at skrive til os.',
    lateSubject: (t) => `Din betaling til ${t} er refunderet`,
    lateBody: (t) =>
      `Din betaling til "${t}" nåede frem, efter at de pladser, vi holdt til dig, var givet fri, og workshoppen kunne ikke længere tage imod din booking.`,
    signoff: 'Zakereh Art',
  },
};

function eventText(d: BookingMailData, lang: Locale) {
  return {
    title: pickText(lang, d.event.title, d.event.title_da) as string,
    description: (pickText(lang, d.event.description, d.event.description_da) ?? '') as string,
    location: (pickText(lang, d.event.location, d.event.location_da) ?? '') as string,
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The .ics attachment sent with the confirmation (UTC times, correct in any calendar app). */
export function bookingIcs(env: Env, d: BookingMailData, lang: Locale): Attachment {
  const t = eventText(d, lang);
  const url = `${siteOrigin(env)}${localePath(lang, `/workshops/${d.event.slug}`)}`;
  const ics = buildIcs({
    uid: `${d.event.id}@zfadavi.com`,
    title: t.title,
    description: [t.description, url].filter(Boolean).join('\n\n'),
    location: t.location || undefined,
    url,
    startsAtIso: d.event.starts_at,
    endsAtIso: d.event.ends_at,
    modifiedIso: d.event.updated_at,
  });
  return { filename: `${d.event.slug.replace(/[^a-z0-9-]/gi, '') || 'workshop'}.ics`, content: toBase64(ics) };
}

type Row = [label: string, value: string];

function render(lines: string[], rows: Row[], tail: string[]): { text: string; html: string } {
  const text = [...lines, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', ...tail].join('\n');
  const html =
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
    (rows.length
      ? `<table cellpadding="4">${rows.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`
      : '') +
    tail.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return { text, html };
}

function detailRows(d: BookingMailData, lang: Locale, s: Strings): Row[] {
  const t = eventText(d, lang);
  const tz = d.event.timezone;
  return [
    [s.workshop, t.title],
    [s.date, formatEventDate(d.event.starts_at, tz, lang)],
    [s.time, formatEventTimes(d.event.starts_at, d.event.ends_at, tz, lang)],
    ...(t.location ? ([[s.where, t.location]] as Row[]) : []),
    [s.places, String(d.booking.number_of_participants)],
    [
      s.total,
      d.booking.amount_minor === 0 ? s.free : `${formatMoney(lang, d.booking.amount_minor, d.booking.currency)} (${s.paid})`,
    ],
    [s.reference, bookingRef(d.booking.id)],
  ];
}

/** To the customer, in the language they booked in, with the calendar file attached. */
export function customerConfirmation(env: Env, d: BookingMailData): QueuedEmail {
  const lang = d.booking.locale;
  const s = STRINGS[lang];
  const title = eventText(d, lang).title;
  const body = render([s.hi(stripControl(d.booking.customer_name)), s.confirmedIntro], detailRows(d, lang, s), [
    s.calendar,
    s.cancelPolicy,
    s.seeYou,
    s.signoff,
  ]);
  return {
    kind: 'booking_confirmation',
    to: d.booking.customer_email,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    subject: s.confirmedSubject(title),
    ...body,
    locale: lang,
    attachments: [bookingIcs(env, d, lang)],
  };
}

/** To the owner (English): who booked what. Reply-To is the customer so the owner can answer directly. */
export function ownerBookingNotification(env: Env, d: BookingMailData): QueuedEmail {
  const title = d.event.title;
  const b = d.booking;
  const money = b.amount_minor === 0 ? 'Free' : formatMoney('en', b.amount_minor, b.currency);
  const rows: Row[] = [
    ['Workshop', title],
    ['Date', formatEventDate(d.event.starts_at, d.event.timezone, 'en')],
    ['Time', formatEventTimes(d.event.starts_at, d.event.ends_at, d.event.timezone, 'en')],
    ['Name', stripControl(b.customer_name)],
    ['Email', b.customer_email],
    ...(b.customer_phone ? ([['Phone', stripControl(b.customer_phone)]] as Row[]) : []),
    ['Places', String(b.number_of_participants)],
    ['Total', money],
    ['Language', b.locale === 'da' ? 'Danish' : 'English'],
    ['Reference', bookingRef(b.id)],
  ];
  return {
    kind: 'booking_notification',
    to: env.OWNER_NOTIFICATION_EMAIL,
    replyTo: b.customer_email,
    subject: `New booking: ${stripControl(title)} (${b.number_of_participants} place${b.number_of_participants === 1 ? '' : 's'})`,
    ...render(['A new booking is confirmed.'], rows, ['Reply to this email to write to the customer.']),
    locale: 'en',
  };
}

export type CancelReason = 'event_cancelled' | 'admin' | 'late_payment';

/** To the customer: the booking is cancelled, with the refund line when money was paid. */
export function customerCancellation(
  env: Env,
  d: BookingMailData,
  opts: { reason: CancelReason; refunded: boolean },
): QueuedEmail {
  const lang = d.booking.locale;
  const s = STRINGS[lang];
  const title = eventText(d, lang).title;
  const paid = d.booking.amount_minor > 0;
  const first =
    opts.reason === 'event_cancelled' ? s.cancelledByUs(title) : opts.reason === 'late_payment' ? s.lateBody(title) : s.cancelledAtRequest(title);
  const money = !paid ? s.noPayment : opts.refunded ? s.refundLine(formatMoney(lang, d.booking.amount_minor, d.booking.currency)) : s.refundPending;
  const rows: Row[] = [
    [s.workshop, title],
    [s.date, formatEventDate(d.event.starts_at, d.event.timezone, lang)],
    [s.reference, bookingRef(d.booking.id)],
  ];
  return {
    kind: 'booking_cancelled',
    to: d.booking.customer_email,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    subject: opts.reason === 'late_payment' ? s.lateSubject(title) : s.cancelledSubject(title),
    ...render([s.hi(stripControl(d.booking.customer_name)), first, money], rows, [s.sorry, s.signoff]),
    locale: lang,
  };
}

/** To the owner (English): something needs a human look (a refund that failed, an odd payment ...). */
export function ownerAttentionAlert(env: Env, d: BookingMailData, note: string): QueuedEmail {
  const b = d.booking;
  return {
    kind: 'booking_attention',
    to: env.OWNER_NOTIFICATION_EMAIL,
    subject: `Booking needs your attention: ${stripControl(d.event.title)}`,
    ...render(
      ['A booking needs your attention. Open Admin > Bookings and filter by "Needs attention".', stripControl(note)],
      [
        ['Workshop', d.event.title],
        ['Name', stripControl(b.customer_name)],
        ['Email', b.customer_email],
        ['Places', String(b.number_of_participants)],
        ['Reference', bookingRef(b.id)],
      ],
      [],
    ),
    locale: 'en',
  };
}
