import { isLocal, isPlaceholder } from '../config';
import type { Env } from '../env';
import { nowIso } from './http';
import { getState, setState } from './site-state';

/**
 * Static-site rebuild trigger (spec section 1.2). The site is rebuilt by a GitHub Actions
 * workflow that the Worker starts with a `repository_dispatch` (event type `site-rebuild`).
 * A failed or skipped trigger must never fail the admin save.
 */

const DEBOUNCE_MS = 60_000;

export type TriggerOutcome = 'triggered' | 'debounced' | 'skipped' | 'failed';

export async function triggerRebuild(env: Env, opts: { force?: boolean } = {}): Promise<TriggerOutcome> {
  if (isPlaceholder(env.GITHUB_DISPATCH_TOKEN) || !env.GITHUB_REPO) {
    await setState(env, 'rebuild_error', '');
    console.log(JSON.stringify({ level: 'info', msg: 'rebuild skipped (no GITHUB_DISPATCH_TOKEN)' }));
    return 'skipped';
  }

  const last = await getState(env, 'rebuild_triggered_at');
  if (!opts.force && last && Date.now() - Date.parse(last) < DEBOUNCE_MS) return 'debounced';

  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'zakereh-art-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'site-rebuild' }),
    });
    if (res.status !== 204) throw new Error(`GitHub responded ${res.status}`);
    await setState(env, 'rebuild_triggered_at', nowIso());
    await setState(env, 'rebuild_error', '');
    return 'triggered';
  } catch (err) {
    await setState(env, 'rebuild_triggered_at', nowIso());
    await setState(env, 'rebuild_error', String(err).slice(0, 300));
    console.log(JSON.stringify({ level: 'error', msg: 'rebuild trigger failed', error: String(err) }));
    return 'failed';
  }
}

/** Call after any admin save that changes public content. Never throws. */
export async function noteContentChange(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
  try {
    await setState(env, 'content_updated_at', nowIso());
    ctx.waitUntil(triggerRebuild(env).catch(() => undefined));
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'noteContentChange failed', error: String(err) }));
  }
}

/** Cron catch-up: a change that was debounced still gets built. */
export async function rebuildCatchUp(env: Env): Promise<void> {
  const changed = await getState(env, 'content_updated_at');
  const triggered = await getState(env, 'rebuild_triggered_at');
  if (changed && (!triggered || changed > triggered)) await triggerRebuild(env);
}

export type RebuildStatus = {
  state: 'pending' | 'done' | 'failed' | 'skipped';
  message: string;
  contentUpdatedAt: string | null;
  lastTriggeredAt: string | null;
};

/** What the admin shows: compares the content timestamp with the one baked into the last build. */
export async function rebuildStatus(env: Env): Promise<RebuildStatus> {
  const contentUpdatedAt = await getState(env, 'content_updated_at');
  const lastTriggeredAt = (await getState(env, 'rebuild_triggered_at')) || null;
  const error = await getState(env, 'rebuild_error');
  const base = { contentUpdatedAt, lastTriggeredAt };

  if (isPlaceholder(env.GITHUB_DISPATCH_TOKEN)) {
    return {
      ...base,
      state: 'skipped',
      message: isLocal(env)
        ? 'Rebuild skipped (local). The public pages read live data while developing.'
        : 'Rebuild is not configured: set GITHUB_DISPATCH_TOKEN.',
    };
  }
  if (error) return { ...base, state: 'failed', message: 'The last rebuild could not be started.' };

  let builtAt: string | null = null;
  try {
    const res = await env.ASSETS.fetch(new Request('https://assets.invalid/build-info.json'));
    if (res.ok) builtAt = ((await res.json()) as { contentUpdatedAt?: string }).contentUpdatedAt ?? null;
  } catch {
    builtAt = null;
  }
  if (contentUpdatedAt && builtAt && builtAt >= contentUpdatedAt) {
    return { ...base, state: 'done', message: 'The public site is up to date.' };
  }
  // Still waiting; if far too long, say it failed so the owner can press "Rebuild site".
  if (lastTriggeredAt && Date.now() - Date.parse(lastTriggeredAt) > 20 * 60_000) {
    return { ...base, state: 'failed', message: 'The rebuild is taking too long. Try "Rebuild site".' };
  }
  return { ...base, state: 'pending', message: 'Rebuilding the site. This takes a few minutes.' };
}
