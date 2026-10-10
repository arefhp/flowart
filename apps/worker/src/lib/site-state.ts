import type { Env } from '../env';
import { nowIso } from './http';

export async function getState(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM site_state WHERE key = ?1').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setState(env: Env, key: string, value: string): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO site_state (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value, now)
    .run();
}
