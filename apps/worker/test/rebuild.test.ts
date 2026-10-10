import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rebuildCatchUp, rebuildStatus, triggerRebuild } from '../src/lib/rebuild';
import { getState, setState } from '../src/lib/site-state';
import { adminJson, baseArtwork, call, testEnv } from './helpers';

afterEach(() => vi.restoreAllMocks());

const withToken = () => testEnv({ GITHUB_DISPATCH_TOKEN: 'github_pat_realtokenvalue' });

function spyGithub(status = 204) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith('https://api.github.com/')) return new Response(null, { status });
    return real(input as RequestInfo, init);
  });
}

describe('site rebuild trigger (spec 1.2)', () => {
  it('without a token the rebuild is skipped and the admin says so', async () => {
    expect(await triggerRebuild(testEnv())).toBe('skipped');
    const status = await rebuildStatus(testEnv());
    expect(status.state).toBe('skipped');
    expect(status.message).toContain('skipped (local)');
  });

  it('sends a repository_dispatch with event type site-rebuild', async () => {
    const spy = spyGithub();
    expect(await triggerRebuild(withToken())).toBe('triggered');
    const [url, init] = spy.mock.calls.find(([u]) => String(u).startsWith('https://api.github.com/'))!;
    expect(String(url)).toBe('https://api.github.com/repos/arefhp/flowart/dispatches');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ event_type: 'site-rebuild' });
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer github_pat_realtokenvalue');
  });

  it('debounces to one trigger per minute', async () => {
    const spy = spyGithub();
    expect(await triggerRebuild(withToken())).toBe('triggered');
    expect(await triggerRebuild(withToken())).toBe('debounced');
    expect(await triggerRebuild(withToken(), { force: true })).toBe('triggered');
    expect(spy.mock.calls.filter(([u]) => String(u).includes('github.com'))).toHaveLength(2);
  });

  it('a failed trigger is recorded and reported, and never throws', async () => {
    spyGithub(401);
    expect(await triggerRebuild(withToken())).toBe('failed');
    const status = await rebuildStatus(withToken());
    expect(status.state).toBe('failed');
  });

  it('a failure to trigger does not fail the admin save', async () => {
    spyGithub(500);
    const res = await adminJson('/api/admin/artworks', 'POST', baseArtwork, { GITHUB_DISPATCH_TOKEN: 'github_pat_realtokenvalue' });
    expect(res.status).toBe(201);
    expect(await getState(env, 'rebuild_error')).toContain('500');
  });

  it('every content save bumps the content timestamp and triggers a rebuild', async () => {
    const spy = spyGithub();
    const before = await getState(env, 'content_updated_at');
    await new Promise((r) => setTimeout(r, 5));
    await adminJson('/api/admin/artworks', 'POST', baseArtwork, { GITHUB_DISPATCH_TOKEN: 'github_pat_realtokenvalue' });
    expect((await getState(env, 'content_updated_at'))! > before!).toBe(true);
    expect(spy.mock.calls.filter(([u]) => String(u).includes('github.com'))).toHaveLength(1);
  });

  it('the cron catch-up builds a change that was debounced', async () => {
    const spy = spyGithub();
    await setState(env, 'rebuild_triggered_at', '2000-01-01T00:00:00.000Z');
    await setState(env, 'content_updated_at', new Date().toISOString());
    await rebuildCatchUp(withToken());
    expect(spy.mock.calls.filter(([u]) => String(u).includes('github.com'))).toHaveLength(1);
  });

  it('shows pending until the built site contains the latest change, then done', async () => {
    spyGithub();
    await triggerRebuild(withToken());
    expect((await rebuildStatus(withToken())).state).toBe('pending');

    // the build writes build-info.json with the content timestamp it saw
    const content = (await getState(env, 'content_updated_at'))!;
    const assets = { fetch: async () => new Response(JSON.stringify({ contentUpdatedAt: content })) } as unknown as Fetcher;
    expect((await rebuildStatus({ ...withToken(), ASSETS: assets })).state).toBe('done');
  });

  it('the admin can start a rebuild and read the status', async () => {
    spyGithub();
    const res = await adminJson('/api/admin/site/rebuild', 'POST', {}, { GITHUB_DISPATCH_TOKEN: 'github_pat_realtokenvalue' });
    expect(await res.json()).toMatchObject({ outcome: 'triggered', status: { state: 'pending' } });
    expect((await call('/api/admin/site/status')).status).toBe(200);
  });

  it('exposes the content version publicly for the site build', async () => {
    const res = await call('/api/site-version');
    expect(((await res.json()) as { contentUpdatedAt: string }).contentUpdatedAt).toMatch(/^\d{4}-/);
  });
});
