// npm run smoke -- https://zfadavi.com
// A quick, read-only health check of a running site (production after a deploy, or `npm run preview`).
// It sends no secrets and changes nothing. Exit code 1 if anything is wrong.
const base = (process.argv[2] ?? 'http://localhost:8788').replace(/\/+$/, '');
let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : extra ? ` (${extra})` : ''}`);
};
const get = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

const health = await get('/api/health');
check('API health answers 200 {ok:true}', health.status === 200 && (await health.json()).ok === true, String(health.status));

const ready = await get('/api/health/ready');
check('database is reachable (/api/health/ready)', ready.status === 200, String(ready.status));

const home = await get('/');
const html = await home.text();
check('home page loads', home.status === 200 && /<html/i.test(html), String(home.status));
const h = home.headers;
check('security headers on pages', h.get('x-content-type-options') === 'nosniff' && /frame-ancestors 'none'/.test(h.get('content-security-policy') ?? '') && /max-age=/.test(h.get('strict-transport-security') ?? ''));
check('a page in Danish exists', (await get('/da')).status === 200);
check('workshops page loads', (await get('/workshops')).status === 200);
check('unknown address gives a 404 page', (await get('/no-such-page-xyz')).status === 404);

const isLocal = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
const closed = (s) => s === 401 || s === 302 || s === 403 || (isLocal && s === 200); // locally the admin bypass is on by design
const me = await get('/api/admin/me');
check('admin API is NOT open without signing in', closed(me.status), String(me.status));
const admin = await get('/api/admin/bookings');
check('admin bookings are NOT open without signing in', closed(admin.status), String(admin.status));

const hook = await get('/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
check('payment webhook rejects an unsigned request', hook.status === 400 || hook.status === 503, String(hook.status));

const fake = await get('/api/dev/stripe/checkout/x');
check('the pretend payment page does not exist here', fake.status === 404, String(fake.status));

const ev = await (await get('/api/events')).json();
check('events API answers', Array.isArray(ev.events));

console.log(failures === 0 ? '\nSmoke test passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
