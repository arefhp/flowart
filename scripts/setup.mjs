// npm run setup: create the two local env files from their examples. NEVER overwrites an existing
// file. Then prints what, if anything, still needs your attention (names only, never values).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKS, WEB_ENV, WEB_EXAMPLE, WORKER_EXAMPLE, WORKER_VARS, parseEnvFile, isPlaceholder, root } from './env-spec.mjs';

const rel = (p) => p.replace(root, '').replace(/^[\\/]/, '').replaceAll('\\', '/');

for (const [example, target] of [
  [WORKER_EXAMPLE, WORKER_VARS],
  [WEB_EXAMPLE, WEB_ENV],
]) {
  if (existsSync(target)) {
    console.log(`kept     ${rel(target)} (already exists, not changed)`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${rel(target)} from ${rel(example)}`);
  }
}

// Folders the local servers expect (empty, git-ignored).
mkdirSync(join(root, 'apps', 'worker', '.local-assets'), { recursive: true });
mkdirSync(join(root, 'apps', 'web', 'out'), { recursive: true });

console.log('\nChecklist (values still to fill in; none are needed to run locally):');
let any = false;
const worker = parseEnvFile(WORKER_VARS) ?? {};
for (const [group, spec] of Object.entries(CHECKS)) {
  const env = group === 'worker' ? worker : (parseEnvFile(WEB_ENV) ?? {});
  for (const feature of spec.features) {
    const missing = feature.vars.filter((v) => isPlaceholder(env[v]));
    if (missing.length) {
      any = true;
      console.log(`  - ${missing.join(', ')}  (${feature.name})`);
    }
  }
}
if (!any) console.log('  nothing');

console.log(`
Next steps:
  npm run migrate:local   create the local database
  npm run seed            add sample artworks (uses your photos from input/ if present)
  npm run dev             site on http://localhost:3000, API on :8787, admin at /admin
`);
