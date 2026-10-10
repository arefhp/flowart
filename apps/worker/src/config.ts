import type { Env } from './env';

/** Cloudflare's published Turnstile test secrets (always pass / always block). Local only. */
export const TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA';
export const TURNSTILE_TEST_SECRET_BLOCK = '2x0000000000000000000000000000000AA';

export function isLocal(env: Env): boolean {
  return env.APP_ENV === 'local';
}

/** A value that is empty or still an obvious example (CHANGE_ME, re_xxx, sk_test_xxx ...). */
export function isPlaceholder(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  const v = value.trim();
  return v === '' || /change[_-]?me/i.test(v) || /_x{3,}$/i.test(v) || /^x{3,}$/i.test(v);
}

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function siteOrigin(env: Env): string {
  try {
    return new URL(env.PUBLIC_SITE_URL).origin;
  } catch {
    return '';
  }
}

/** Origins allowed to make state-changing admin requests (CSRF, spec section 8). */
export function allowedAdminOrigins(env: Env): string[] {
  const origins = [siteOrigin(env)].filter(Boolean);
  if (isLocal(env)) {
    origins.push(
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8787',
      'http://127.0.0.1:8787',
    );
  }
  return origins;
}

/**
 * How payments run: 'real' (Stripe, sandbox or live keys), 'fake' (local-only pretend payment page,
 * used only while no real key is set) or 'off' (booking a paid workshop answers 503).
 */
export function stripeMode(env: Env): 'real' | 'fake' | 'off' {
  if (!isPlaceholder(env.STRIPE_SECRET_KEY)) return 'real';
  if (isLocal(env) && env.STRIPE_FAKE === 'true') return 'fake';
  return 'off';
}

/** Unpaid places are held this long. At least 30: Stripe keeps a payment page open for 30 minutes or more. */
export function holdMinutes(env: Env): number {
  return Math.max(30, Number(env.BOOKING_HOLD_MINUTES ?? '30') || 30);
}

export function adminBypassActive(env: Env): boolean {
  return isLocal(env) && env.ADMIN_DEV_BYPASS === 'true';
}

/**
 * Names (never values) of variables that are missing or unsafe. In production any
 * problem makes the Worker refuse to serve; the message names the variable only.
 */
export function configProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.APP_ENV !== 'local' && env.APP_ENV !== 'production') {
    problems.push('APP_ENV (must be "local" or "production")');
  }
  if (!siteOrigin(env)) problems.push('PUBLIC_SITE_URL');
  if (!env.MEDIA_BASE_URL) problems.push('MEDIA_BASE_URL');
  if (!env.EMAIL_FROM_ADDRESS) problems.push('EMAIL_FROM_ADDRESS');
  if (!env.OWNER_NOTIFICATION_EMAIL) problems.push('OWNER_NOTIFICATION_EMAIL');

  if (isLocal(env)) return problems;

  // ---- production ----
  if (env.ADMIN_DEV_BYPASS !== undefined && env.ADMIN_DEV_BYPASS !== '' && env.ADMIN_DEV_BYPASS !== 'false') {
    problems.push('ADMIN_DEV_BYPASS (must not be set in production)');
  }
  if (!siteOrigin(env).startsWith('https://')) problems.push('PUBLIC_SITE_URL (must be https in production)');
  if (isPlaceholder(env.ACCESS_TEAM_NAME)) problems.push('ACCESS_TEAM_NAME');
  if (isPlaceholder(env.ACCESS_AUD)) problems.push('ACCESS_AUD');
  if (adminEmails(env).length === 0) problems.push('ADMIN_EMAILS');
  if (isPlaceholder(env.TURNSTILE_SECRET_KEY)) {
    problems.push('TURNSTILE_SECRET_KEY');
  } else if (
    env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET_PASS ||
    env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET_BLOCK
  ) {
    problems.push('TURNSTILE_SECRET_KEY (test key is not allowed in production)');
  }
  if (env.STRIPE_FAKE !== undefined && env.STRIPE_FAKE !== '' && env.STRIPE_FAKE !== 'false') {
    problems.push('STRIPE_FAKE (must not be set in production)');
  }
  if (isPlaceholder(env.STRIPE_SECRET_KEY)) problems.push('STRIPE_SECRET_KEY');
  if (isPlaceholder(env.STRIPE_WEBHOOK_SECRET)) problems.push('STRIPE_WEBHOOK_SECRET');
  if (env.EMAIL_DRIVER !== 'resend') {
    problems.push('EMAIL_DRIVER (must be "resend" in production)');
  } else {
    if (isPlaceholder(env.RESEND_API_KEY)) problems.push('RESEND_API_KEY');
    const fromDomain = env.EMAIL_FROM_ADDRESS?.split('@')[1]?.toLowerCase();
    const siteHost = (() => {
      try {
        return new URL(env.PUBLIC_SITE_URL).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    if (fromDomain && siteHost && fromDomain !== siteHost && !siteHost.endsWith(`.${fromDomain}`)) {
      problems.push('EMAIL_FROM_ADDRESS (domain must match the site domain)');
    }
  }
  return problems;
}
