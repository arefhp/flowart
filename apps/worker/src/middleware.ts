import type { Context, MiddlewareHandler } from 'hono';
import { adminBypassActive, allowedAdminOrigins, configProblems } from './config';
import { verifyAccessJwt } from './lib/access';
import { errorBody, HttpError, unauthorized, type AppBindings } from './lib/http';

/** Request id, structured log line (no secrets, no query string, no PII) and secure headers. */
export const requestContext: MiddlewareHandler<AppBindings> = async (c, next) => {
  const started = Date.now();
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.res.headers.set('X-Request-Id', requestId);
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  console.log(
    JSON.stringify({
      level: 'info',
      request_id: requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Date.now() - started,
    }),
  );
};

/** Production refuses to serve with missing or unsafe configuration; it names variables only. */
export const configGuard: MiddlewareHandler<AppBindings> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/health') return next();
  const problems = configProblems(c.env);
  if (problems.length > 0) {
    console.log(JSON.stringify({ level: 'error', msg: 'configuration problem', variables: problems }));
    return c.json(
      errorBody('misconfigured', `Server configuration is incomplete. Check: ${problems.join(', ')}`),
      500,
    );
  }
  return next();
};

/**
 * Admin gate (spec section 8): Cloudflare Access JWT (or the local-only bypass), then CSRF
 * checks for state-changing requests. Every failure to authenticate is a plain 401.
 */
export const adminAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  let email: string;
  if (adminBypassActive(c.env)) {
    email = 'dev@localhost';
  } else {
    const result = await verifyAccessJwt(c.env, c.req.header('Cf-Access-Jwt-Assertion'));
    if (!result.ok) throw unauthorized();
    email = result.email;
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (!origin || !allowedAdminOrigins(c.env).includes(origin)) {
      throw new HttpError(403, 'csrf', 'This request was blocked (origin check).');
    }
    if (c.req.header('X-Admin-Request') !== '1') {
      throw new HttpError(403, 'csrf', 'This request was blocked (missing admin header).');
    }
  }
  c.set('adminEmail', email);
  await next();
};

/** `executionCtx` throws outside a real fetch; fall back to a harmless stand-in (tests, scripts). */
export function getCtx(c: Context<AppBindings>): { waitUntil(p: Promise<unknown>): void } {
  try {
    return c.executionCtx;
  } catch {
    return { waitUntil: (p) => void p.catch(() => undefined) };
  }
}
