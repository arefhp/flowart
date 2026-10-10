import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import { adminJson, call } from './helpers';

// A valid production configuration (Access on, bypass off, real-looking secrets).
const TEAM = 'zakereh-test';
const AUD = 'aud-tag-1234567890';
const OWNER = 'owner@example.com';
const prod = {
  APP_ENV: 'production',
  ADMIN_DEV_BYPASS: undefined,
  PUBLIC_SITE_URL: 'https://zfadavi.com',
  MEDIA_BASE_URL: 'https://media.zfadavi.com',
  ACCESS_TEAM_NAME: TEAM,
  ACCESS_AUD: AUD,
  ADMIN_EMAILS: `${OWNER}, other@example.com`,
  EMAIL_DRIVER: 'resend',
  RESEND_API_KEY: 're_live_abcdefghijk',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-value',
  STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890',
  STRIPE_WEBHOOK_SECRET: 'whsec_realvalue1234567890',
  STRIPE_FAKE: undefined,
};

const enc = new TextEncoder();
const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function makeKeyPair(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey: pair.privateKey, jwk, kid };
}

async function sign(
  key: { privateKey: CryptoKey; kid: string },
  claims: Record<string, unknown>,
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: key.kid, typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

const goodClaims = () => ({
  iss: `https://${TEAM}.cloudflareaccess.com`,
  aud: [AUD],
  email: OWNER,
  exp: Math.floor(Date.now() / 1000) + 600,
  nbf: Math.floor(Date.now() / 1000) - 10,
});

/** Make the Access JWKS endpoint answer with the given public keys. */
function serveJwks(...jwks: object[]) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) {
      return new Response(JSON.stringify({ keys: jwks }), { headers: { 'Content-Type': 'application/json' } });
    }
    return real(input as RequestInfo, init);
  });
}

afterEach(() => vi.restoreAllMocks());

/** Every registered /api/admin route, with path parameters filled in. */
function adminRoutes() {
  return app.routes
    .filter((r) => r.path.startsWith('/api/admin') && r.method !== 'ALL')
    .map((r) => ({ method: r.method, path: r.path.replace(/:\w+/g, 'x') }));
}

describe('admin authorization (spec section 8)', () => {
  it('registers admin routes (the enumeration below is not vacuous)', () => {
    expect(adminRoutes().length).toBeGreaterThan(15);
  });

  it('EVERY /api/admin route returns 401 without a token', async () => {
    for (const { method, path } of adminRoutes()) {
      const res = await call(path, { method }, prod);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('every admin route rejects an expired token, a wrong audience and a non-allowlisted email', async () => {
    const key = await makeKeyPair('k1');
    serveJwks(key.jwk);
    const bad = {
      expired: await sign(key, { ...goodClaims(), exp: Math.floor(Date.now() / 1000) - 3600 }),
      wrongAud: await sign(key, { ...goodClaims(), aud: ['some-other-app'] }),
      notAllowed: await sign(key, { ...goodClaims(), email: 'stranger@example.com' }),
      wrongIssuer: await sign(key, { ...goodClaims(), iss: 'https://evil.cloudflareaccess.com' }),
      notYetValid: await sign(key, { ...goodClaims(), nbf: Math.floor(Date.now() / 1000) + 3600 }),
    };
    for (const [name, token] of Object.entries(bad)) {
      for (const { method, path } of adminRoutes()) {
        const res = await call(path, { method, headers: { 'Cf-Access-Jwt-Assertion': token } }, prod);
        expect(res.status, `${name}: ${method} ${path}`).toBe(401);
      }
    }
  });

  it('rejects a token signed with a key Access does not publish', async () => {
    const real = await makeKeyPair('k1');
    const forger = await makeKeyPair('k1'); // same kid, different key
    serveJwks(real.jwk);
    const token = await sign(forger, goodClaims());
    const res = await call('/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, prod);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned (alg=none) token and garbage', async () => {
    const none = `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(goodClaims()))}.`;
    for (const token of [none, 'garbage', 'a.b.c']) {
      const res = await call('/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, prod);
      expect(res.status).toBe(401);
    }
  });

  it('accepts a valid token for an allowlisted email (case-insensitive)', async () => {
    const key = await makeKeyPair('k1');
    serveJwks(key.jwk);
    const token = await sign(key, { ...goodClaims(), email: 'OWNER@Example.com' });
    const res = await call('/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, prod);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: OWNER, devMode: false });
  });

  it('refetches the keys when the kid is unknown (key rotation) but not more than once a minute', async () => {
    const oldKey = await makeKeyPair('old');
    const newKey = await makeKeyPair('new');
    const spy = serveJwks(oldKey.jwk);
    await call('/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': await sign(oldKey, goodClaims()) } }, prod);
    spy.mockRestore();
    const spy2 = serveJwks(oldKey.jwk, newKey.jwk);
    // within the cooldown an unknown kid does not trigger a refetch
    const res = await call('/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': await sign(newKey, goodClaims()) } }, prod);
    expect(res.status).toBe(401);
    expect(spy2.mock.calls.filter(([u]) => String(u).includes('cloudflareaccess')).length).toBe(0);
  });

  it('state-changing admin requests also need the Origin and X-Admin-Request headers (CSRF)', async () => {
    const key = await makeKeyPair('k1');
    serveJwks(key.jwk);
    const token = await sign(key, goodClaims());
    const headers = { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json' };
    const body = JSON.stringify({});
    const noOrigin = await call('/api/admin/site/rebuild', { method: 'POST', headers: { ...headers, 'X-Admin-Request': '1' }, body }, prod);
    const wrongOrigin = await call('/api/admin/site/rebuild', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example', 'X-Admin-Request': '1' }, body }, prod);
    const noHeader = await call('/api/admin/site/rebuild', { method: 'POST', headers: { ...headers, Origin: 'https://zfadavi.com' }, body }, prod);
    expect(noOrigin.status).toBe(403);
    expect(wrongOrigin.status).toBe(403);
    expect(noHeader.status).toBe(403);
    const ok = await call('/api/admin/site/rebuild', { method: 'POST', headers: { ...headers, Origin: 'https://zfadavi.com', 'X-Admin-Request': '1' }, body }, prod);
    expect(ok.status).toBe(200);
  });
});

describe('local development bypass', () => {
  it('works only when APP_ENV is local and ADMIN_DEV_BYPASS is true', async () => {
    const res = await call('/api/admin/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'dev@localhost', devMode: true });
  });

  it('is off when not set, even locally', async () => {
    const res = await call('/api/admin/me', {}, { ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('the Worker REFUSES to serve in production when ADMIN_DEV_BYPASS is set', async () => {
    const res = await call('/api/admin/me', {}, { ...prod, ADMIN_DEV_BYPASS: 'true' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('misconfigured');
    expect(body.error.message).toContain('ADMIN_DEV_BYPASS');
    // public routes refuse too, not just admin
    expect((await call('/api/artworks', {}, { ...prod, ADMIN_DEV_BYPASS: 'true' })).status).toBe(500);
    // liveness still answers so monitoring can see the Worker is up
    expect((await call('/api/health', {}, { ...prod, ADMIN_DEV_BYPASS: 'true' })).status).toBe(200);
  });

  it('a production request never gets in by claiming to be local through headers', async () => {
    const res = await call('/api/admin/me', { headers: { 'X-Forwarded-For': '127.0.0.1', Host: 'localhost' } }, prod);
    expect(res.status).toBe(401);
  });
});

describe('admin CSRF in local development', () => {
  it('blocks state-changing requests without the headers', async () => {
    const noHeaders = await call('/api/admin/artworks', { method: 'POST', body: '{}' });
    expect(noHeaders.status).toBe(403);
    const ok = await adminJson('/api/admin/artworks', 'POST', {});
    expect(ok.status).toBe(400); // passes CSRF, fails validation
  });
});
