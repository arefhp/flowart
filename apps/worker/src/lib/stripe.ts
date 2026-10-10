import { stripeMode } from '../config';
import type { Env } from '../env';
import { HttpError, uuid } from './http';

/**
 * A small Stripe client written with fetch and Web Crypto instead of the official SDK. The SDK is
 * large and the free Workers plan has a tight CPU limit; the three calls we need (create a
 * Checkout Session, refund, check a webhook signature) are short and fully covered by tests.
 *
 * Money rule: amounts are ALWAYS computed on the server from the event's price. Nothing the
 * browser sends is ever used as a price.
 */

/** Pinned so a Stripe-side change never alters behaviour under us. */
export const STRIPE_API_VERSION = '2024-06-20';
const API = 'https://api.stripe.com';
/** Webhook timestamps older than this are rejected (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export class StripeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CheckoutInput {
  bookingId: string;
  eventTitle: string;
  unitAmountMinor: number;
  quantity: number;
  currency: string;
  customerEmail: string;
  locale: 'en' | 'da';
  successUrl: string;
  cancelUrl: string;
  /** unix seconds; Stripe requires at least 30 minutes ahead */
  expiresAt: number;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

async function stripeRequest<T>(env: Env, path: string, body: URLSearchParams, idempotencyKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION,
        'Idempotency-Key': idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new StripeError(0, 'Stripe could not be reached.');
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = JSON.parse(text);
  } catch {
    // keep {}
  }
  if (!res.ok) {
    // Stripe's message never contains our key; still cap it before it reaches a log line.
    const message = (data as { error?: { message?: string } }).error?.message ?? `Stripe responded ${res.status}`;
    throw new StripeError(res.status, message.slice(0, 200));
  }
  return data as T;
}

export async function createCheckoutSession(env: Env, input: CheckoutInput): Promise<CheckoutSession> {
  const mode = stripeMode(env);
  if (mode === 'off') {
    throw new HttpError(503, 'payments_not_configured', 'Online payment is not available right now. Please contact us to book.');
  }
  if (mode === 'fake') {
    const origin = new URL(input.successUrl).origin;
    return { id: `cs_test_fake_${uuid().replace(/-/g, '')}`, url: `${origin}/api/dev/stripe/checkout/${input.bookingId}` };
  }

  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('client_reference_id', input.bookingId);
  p.set('customer_email', input.customerEmail);
  p.set('locale', input.locale);
  p.set('success_url', input.successUrl);
  p.set('cancel_url', input.cancelUrl);
  p.set('expires_at', String(input.expiresAt));
  p.set('metadata[booking_id]', input.bookingId);
  p.set('payment_intent_data[metadata][booking_id]', input.bookingId);
  p.set('line_items[0][quantity]', String(input.quantity));
  p.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
  p.set('line_items[0][price_data][unit_amount]', String(input.unitAmountMinor));
  p.set('line_items[0][price_data][product_data][name]', input.eventTitle.slice(0, 250));
  // No payment_method_types: Stripe shows the methods enabled in the dashboard (cards and wallets).
  const session = await stripeRequest<{ id: string; url: string | null }>(
    env,
    '/v1/checkout/sessions',
    p,
    `booking-${input.bookingId}`,
  );
  if (!session.url) throw new StripeError(502, 'Stripe did not return a payment page.');
  return { id: session.id, url: session.url };
}

export interface Refund {
  id: string;
}

/** Full refund of a payment. Safe to call twice: the idempotency key makes the second call a no-op. */
export async function createRefund(env: Env, bookingId: string, paymentIntentId: string): Promise<Refund> {
  const mode = stripeMode(env);
  if (mode === 'off') throw new StripeError(0, 'Stripe is not configured.');
  if (mode === 'fake') return { id: `re_fake_${uuid().replace(/-/g, '')}` };
  const p = new URLSearchParams({ payment_intent: paymentIntentId });
  p.set('metadata[booking_id]', bookingId);
  return stripeRequest<Refund>(env, '/v1/refunds', p, `refund-${bookingId}`);
}

// ---------------------------------------------------------------------------
// Webhook signature (https://docs.stripe.com/webhooks#verify-manually)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^([0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Compute the `Stripe-Signature` header for a payload. Used by tests and the local fake checkout. */
export async function signWebhookPayload(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

/**
 * Check a webhook really came from Stripe: HMAC-SHA256 over `timestamp.rawBody` with the signing
 * secret, compared in constant time, and the timestamp must be recent. `payload` must be the RAW
 * request text, exactly as received.
 */
export async function verifyWebhookSignature(
  secret: string,
  payload: string,
  header: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = Number(v);
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(`${timestamp}.${payload}`);
  for (const sig of signatures) {
    const bytes = hexToBytes(sig);
    // subtle.verify compares in constant time
    if (bytes && (await crypto.subtle.verify('HMAC', key, bytes, data))) return true;
  }
  return false;
}
