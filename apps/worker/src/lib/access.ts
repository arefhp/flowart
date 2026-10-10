import { adminEmails } from '../config';
import type { Env } from '../env';

/**
 * Cloudflare Access JWT verification (spec section 8). Defence in depth: Access already
 * gates /admin* and /api/admin/*, and the Worker re-verifies the token it forwards.
 */

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_REFETCH_COOLDOWN_MS = 60 * 1000;

const cache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

/** Test hook: forget cached keys. */
export function clearJwksCache(): void {
  cache.clear();
}

async function fetchJwks(team: string): Promise<Jwk[]> {
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

/** Keys for the team, cached briefly; refetches (at most once a minute) when `kid` is unknown. */
async function getKey(team: string, kid: string | undefined): Promise<Jwk | undefined> {
  const now = Date.now();
  let entry = cache.get(team);
  if (!entry || now - entry.fetchedAt > JWKS_TTL_MS) {
    entry = { keys: await fetchJwks(team), fetchedAt: now };
    cache.set(team, entry);
  }
  let key = entry.keys.find((k) => k.kid === kid);
  if (!key && now - entry.fetchedAt > JWKS_REFETCH_COOLDOWN_MS) {
    entry = { keys: await fetchJwks(team), fetchedAt: now };
    cache.set(team, entry);
    key = entry.keys.find((k) => k.kid === kid);
  }
  return key;
}

function b64urlToBytes(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export type AccessResult = { ok: true; email: string } | { ok: false; reason: string };

export async function verifyAccessJwt(env: Env, token: string | null | undefined): Promise<AccessResult> {
  if (!token) return { ok: false, reason: 'missing token' };
  const team = env.ACCESS_TEAM_NAME;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return { ok: false, reason: 'access not configured' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [h, p, s] = parts as [string, string, string];

  try {
    const header = parseJson<{ alg?: string; kid?: string }>(b64urlToBytes(h));
    if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported alg' };

    const jwk = await getKey(team, header.kid);
    if (!jwk) return { ok: false, reason: 'unknown key' };

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) return { ok: false, reason: 'bad signature' };

    const claims = parseJson<{
      iss?: string;
      aud?: string | string[];
      exp?: number;
      nbf?: number;
      email?: string;
    }>(b64urlToBytes(p));

    const nowSec = Math.floor(Date.now() / 1000);
    const skew = 30;
    if (claims.iss !== `https://${team}.cloudflareaccess.com`) return { ok: false, reason: 'bad issuer' };
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!audiences.includes(aud)) return { ok: false, reason: 'bad audience' };
    if (typeof claims.exp !== 'number' || claims.exp + skew < nowSec) return { ok: false, reason: 'expired' };
    if (typeof claims.nbf === 'number' && claims.nbf - skew > nowSec) return { ok: false, reason: 'not yet valid' };

    const email = (claims.email ?? '').toLowerCase();
    if (!email || !adminEmails(env).includes(email)) return { ok: false, reason: 'email not allowed' };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'verification error' };
  }
}
