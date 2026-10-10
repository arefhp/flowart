import type { Env } from '../env';
import { sha256Hex } from './http';

/**
 * Fixed-window counter in D1 (never in memory only, spec section 14). Returns true when the
 * request is allowed. The key is hashed so no raw IP address is stored.
 */
export async function allowRequest(
  env: Env,
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `${scope}:${(await sha256Hex(identity)).slice(0, 24)}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSeconds);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}
