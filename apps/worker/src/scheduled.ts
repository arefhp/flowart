import type { Env } from './env';
import { flushOutbox } from './email';
import { rebuildCatchUp } from './lib/rebuild';
import { completePastEvents } from './services/events';
import { retryFailedDeletes } from './services/images';

export const FREQUENT_CRON = '*/15 * * * *';
export const DAILY_CRON = '17 3 * * *';

async function safe(name: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: `cron job failed: ${name}`, error: String(err) }));
  }
}

/** Scheduled work (Cron Triggers). Nothing here needs an HTTP endpoint, so nothing to protect. */
export async function runScheduled(cron: string, env: Env): Promise<void> {
  if (cron === DAILY_CRON) {
    await safe('purge', () => dailyPurge(env));
    return;
  }
  await safe('email outbox', () => flushOutbox(env, { limit: 25 }));
  await safe('r2 delete retry', () => retryFailedDeletes(env));
  await safe('complete past events', () => completePastEvents(env));
  await safe('rebuild catch-up', () => rebuildCatchUp(env));
}

/** Retention: old rate-limit rows, old contact messages and old sent mail (personal data). */
export async function dailyPurge(env: Env): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(nowSec - 2 * 86_400).run();

  const months = Math.max(1, Number(env.CONTACT_RETENTION_MONTHS ?? '12') || 12);
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  await env.DB.prepare('DELETE FROM contact_messages WHERE created_at < ?1').bind(cutoff.toISOString()).run();

  const mailCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  await env.DB.prepare(`DELETE FROM email_outbox WHERE status IN ('sent', 'dead') AND created_at < ?1`)
    .bind(mailCutoff)
    .run();
}
