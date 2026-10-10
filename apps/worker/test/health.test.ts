import { describe, expect, it } from 'vitest';
import { call } from './helpers';

describe('health', () => {
  it('liveness does not need the database', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('readiness runs a trivial D1 query', async () => {
    const res = await call('/api/health/ready');
    expect(res.status).toBe(200);
  });

  it('unknown API paths return the consistent error shape', async () => {
    const res = await call('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('sets secure headers and a request id', async () => {
    const res = await call('/api/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });
});
