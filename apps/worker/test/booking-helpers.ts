import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import { call } from './helpers';

export const valid = { name: 'Anna Jensen', email: 'anna@example.com', participants: 2, locale: 'en', consent: true, turnstileToken: 'x' };

export const book = (slug: string, body: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) =>
  call(
    `/api/events/${slug}/bookings`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...valid, ...body }) },
    overrides,
  );

export type Created = { bookingToken: string; checkoutUrl?: string; confirmed?: boolean };
export const created = async (res: Response) => {
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await res.json()) as Created;
};
export const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string; details?: { fields?: Record<string, string>; remaining?: number } } }).error;

export const rowByToken = (token: string) =>
  env.DB.prepare('SELECT * FROM event_bookings WHERE public_token = ?1').bind(token).first<Record<string, unknown>>();

export const outbox = async () =>
  (await env.DB.prepare('SELECT kind, to_email, reply_to, subject, text_body, html_body, attachments_json, locale FROM email_outbox ORDER BY created_at, id').all<{
    kind: string;
    to_email: string;
    reply_to: string | null;
    subject: string;
    text_body: string;
    html_body: string | null;
    attachments_json: string | null;
    locale: string;
  }>()).results;

