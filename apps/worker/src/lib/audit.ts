import type { Env } from '../env';
import { nowIso, uuid } from './http';

/** Record an admin action (spec section 8). `details` must never contain secrets or personal data. */
export async function audit(
  env: Env,
  actorEmail: string,
  action: string,
  entity?: string,
  entityId?: string,
  details?: Record<string, unknown>,
  opts: { resolved?: boolean } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_log (id, at, actor_email, action, entity, entity_id, details, resolved) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
    )
      .bind(
        uuid(),
        nowIso(),
        actorEmail,
        action,
        entity ?? null,
        entityId ?? null,
        details ? JSON.stringify(details) : null,
        opts.resolved === false ? 0 : 1,
      )
      .run();
  } catch (err) {
    // Auditing must never break the admin action itself.
    console.log(JSON.stringify({ level: 'error', msg: 'audit write failed', error: String(err) }));
  }
}
