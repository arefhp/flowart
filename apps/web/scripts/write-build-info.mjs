// After a build, record which version of the content it was built from (out/build-info.json).
// The Worker compares it with the latest content change to tell the admin whether the public
// site is "up to date" or "rebuilding" (see rebuildStatus in the Worker).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(webDir, 'out');

function envFromFile() {
  const file = join(webDir, '.env.local');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

const base = (process.env.BUILD_API_BASE_URL ?? envFromFile().BUILD_API_BASE_URL ?? 'https://zfadavi.com').replace(/\/+$/, '');

let contentUpdatedAt = null;
try {
  const res = await fetch(`${base}/api/site-version`);
  if (res.ok) contentUpdatedAt = (await res.json()).contentUpdatedAt ?? null;
} catch {
  // an empty first-deploy build (ALLOW_EMPTY_BUILD=1) has no API yet; that is fine
}

writeFileSync(join(outDir, 'build-info.json'), JSON.stringify({ contentUpdatedAt, builtAt: new Date().toISOString() }));
console.log(`Wrote out/build-info.json (content version: ${contentUpdatedAt ?? 'unknown'})`);
