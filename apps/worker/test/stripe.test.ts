import { afterEach, describe, expect, it, vi } from 'vitest';
import { configProblems, stripeMode } from '../src/config';
import {
  StripeError,
  STRIPE_API_VERSION,
  WEBHOOK_TOLERANCE_SECONDS,
  createCheckoutSession,
  createRefund,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../src/lib/stripe';
import { testEnv } from './helpers';

const SECRET = 'whsec_unit_test_secret';
const REAL = { STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: undefined };

afterEach(() => vi.restoreAllMocks());

describe('webhook signature (Stripe-Signature)', () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const now = 1_800_000_000;

  it('accepts a correctly signed, fresh payload', async () => {
    const header = await signWebhookPayload(SECRET, body, now);
    expect(await verifyWebhookSignature(SECRET, body, header, now)).toBe(true);
  });

  it('rejects a wrong secret, a changed body, a missing header and garbage', async () => {
    const header = await signWebhookPayload(SECRET, body, now);
    expect(await verifyWebhookSignature('whsec_other', body, header, now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body + ' ', header, now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, null, now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, '', now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, 'v1=abc', now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, `t=${now},v1=nothex!`, now)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, `t=${now},v1=`, now)).toBe(false);
  });

  it('rejects an old or future timestamp (replay protection) even when the signature is genuine', async () => {
    const old = await signWebhookPayload(SECRET, body, now - WEBHOOK_TOLERANCE_SECONDS - 1);
    expect(await verifyWebhookSignature(SECRET, body, old, now)).toBe(false);
    const future = await signWebhookPayload(SECRET, body, now + WEBHOOK_TOLERANCE_SECONDS + 1);
    expect(await verifyWebhookSignature(SECRET, body, future, now)).toBe(false);
    const edge = await signWebhookPayload(SECRET, body, now - WEBHOOK_TOLERANCE_SECONDS);
    expect(await verifyWebhookSignature(SECRET, body, edge, now)).toBe(true);
  });

  it('accepts when any one of several v1 signatures matches (secret rotation)', async () => {
    const good = (await signWebhookPayload(SECRET, body, now)).split(',v1=')[1];
    expect(await verifyWebhookSignature(SECRET, body, `t=${now},v1=${'0'.repeat(64)},v1=${good}`, now)).toBe(true);
  });

  it('matches the example in the Stripe documentation format (t=..,v1=<hex>)', async () => {
    const header = await signWebhookPayload(SECRET, body, now);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
  });
});

describe('payment mode', () => {
  it('real when a real key is set, fake only locally with no key, otherwise off', () => {
    expect(stripeMode(testEnv({ STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890' }))).toBe('real');
    expect(stripeMode(testEnv({ STRIPE_SECRET_KEY: 'sk_test_xxx', STRIPE_FAKE: 'true' }))).toBe('fake');
    expect(stripeMode(testEnv({ STRIPE_SECRET_KEY: undefined, STRIPE_FAKE: 'true' }))).toBe('fake');
    expect(stripeMode(testEnv({ STRIPE_SECRET_KEY: undefined, STRIPE_FAKE: undefined }))).toBe('off');
    // a real key always wins over the pretend mode
    expect(stripeMode(testEnv({ STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: 'true' }))).toBe('real');
    // never fake in production
    expect(stripeMode(testEnv({ APP_ENV: 'production', STRIPE_SECRET_KEY: undefined, STRIPE_FAKE: 'true' }))).toBe('off');
  });

  it('production refuses to start without Stripe keys or with the pretend mode, naming the variables only', () => {
    const base = {
      APP_ENV: 'production',
      ADMIN_DEV_BYPASS: undefined,
      PUBLIC_SITE_URL: 'https://zfadavi.com',
      MEDIA_BASE_URL: 'https://media.zfadavi.com',
      ACCESS_TEAM_NAME: 'team',
      ACCESS_AUD: 'aud',
      ADMIN_EMAILS: 'owner@example.com',
      EMAIL_DRIVER: 'resend',
      RESEND_API_KEY: 're_live_abcdefghijk',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-value',
    };
    const text = configProblems(testEnv({ ...base, STRIPE_SECRET_KEY: 'sk_test_xxx', STRIPE_WEBHOOK_SECRET: undefined, STRIPE_FAKE: 'true' })).join('|');
    expect(text).toContain('STRIPE_SECRET_KEY');
    expect(text).toContain('STRIPE_WEBHOOK_SECRET');
    expect(text).toContain('STRIPE_FAKE');
    expect(text).not.toContain('sk_test_xxx');
  });
});

describe('Checkout Session request', () => {
  const input = {
    bookingId: 'b-123',
    eventTitle: 'Oil Painting for Beginners',
    unitAmountMinor: 55000,
    quantity: 3,
    currency: 'DKK',
    customerEmail: 'anna@example.com',
    locale: 'da' as const,
    successUrl: 'https://zfadavi.com/da/booking/success?token=t',
    cancelUrl: 'https://zfadavi.com/da/booking/cancelled?token=t',
    expiresAt: 1_800_001_860,
  };

  it('sends the server-computed amount and the booking id, with idempotency and a pinned API version', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })));
    const session = await createCheckoutSession(testEnv(REAL), input);
    expect(session).toEqual({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_realvalue1234567890');
    expect(headers['Idempotency-Key']).toBe('booking-b-123');
    expect(headers['Stripe-Version']).toBe(STRIPE_API_VERSION);
    const form = new URLSearchParams((init as RequestInit).body as URLSearchParams);
    expect(form.get('mode')).toBe('payment');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('55000');
    expect(form.get('line_items[0][quantity]')).toBe('3');
    expect(form.get('line_items[0][price_data][currency]')).toBe('dkk');
    expect(form.get('line_items[0][price_data][product_data][name]')).toBe('Oil Painting for Beginners');
    expect(form.get('client_reference_id')).toBe('b-123');
    expect(form.get('metadata[booking_id]')).toBe('b-123');
    expect(form.get('payment_intent_data[metadata][booking_id]')).toBe('b-123');
    expect(form.get('customer_email')).toBe('anna@example.com');
    expect(form.get('locale')).toBe('da');
    expect(form.get('expires_at')).toBe('1800001860');
    expect(form.get('success_url')).toContain('/da/booking/success');
    // payment methods are chosen in the Stripe dashboard (cards and wallets), not hard-coded
    expect(form.has('payment_method_types[0]')).toBe(false);
  });

  it('turns a Stripe error into a StripeError without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid currency' } }), { status: 400 }));
    const err = await createCheckoutSession(testEnv(REAL), input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeError);
    expect((err as StripeError).message).toBe('Invalid currency');
    expect(String(err)).not.toContain('sk_test_realvalue');
  });

  it('a network failure is a StripeError, not a crash', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    await expect(createCheckoutSession(testEnv(REAL), input)).rejects.toBeInstanceOf(StripeError);
  });

  it('pretend mode returns a local payment page and never calls the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const s = await createCheckoutSession(testEnv(), input);
    expect(s.id).toMatch(/^cs_test_fake_/);
    expect(s.url).toBe('https://zfadavi.com/api/dev/stripe/checkout/b-123');
    expect(spy).not.toHaveBeenCalled();
  });

  it('with no payment configuration a paid booking is a clear 503', async () => {
    await expect(createCheckoutSession(testEnv({ STRIPE_SECRET_KEY: undefined, STRIPE_FAKE: undefined }), input)).rejects.toMatchObject({
      status: 503,
      code: 'payments_not_configured',
    });
  });
});

describe('refund request', () => {
  it('refunds the whole payment with an idempotency key per booking', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 're_1' })));
    expect(await createRefund(testEnv(REAL), 'b-9', 'pi_abc')).toEqual({ id: 're_1' });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/refunds');
    expect(((init as RequestInit).headers as Record<string, string>)['Idempotency-Key']).toBe('refund-b-9');
    const form = new URLSearchParams((init as RequestInit).body as URLSearchParams);
    expect(form.get('payment_intent')).toBe('pi_abc');
    expect(form.has('amount')).toBe(false); // no amount = refund everything
  });
});
