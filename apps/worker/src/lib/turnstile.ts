import { TURNSTILE_TEST_SECRET_BLOCK, TURNSTILE_TEST_SECRET_PASS, isLocal, isPlaceholder } from '../config';
import type { Env } from '../env';

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/** Verify a Turnstile token server-side. Never trust the browser's claim. */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (isPlaceholder(secret)) return { ok: false, reason: 'not configured' };

  // Offline-friendly local development: Cloudflare's published test secrets are decided here,
  // so no network call is needed. Production rejects these secrets at startup.
  if (isLocal(env)) {
    if (secret === TURNSTILE_TEST_SECRET_PASS) return { ok: true };
    if (secret === TURNSTILE_TEST_SECRET_BLOCK) return { ok: false, reason: 'blocked by test secret' };
  }

  if (!token) return { ok: false, reason: 'missing token' };
  const body = new URLSearchParams({ secret: secret!, response: token });
  if (remoteIp && remoteIp !== 'local') body.set('remoteip', remoteIp);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: 'verification failed' };
  } catch {
    return { ok: false, reason: 'verification unavailable' };
  }
}
