// npm run check-env: report missing or placeholder variables by NAME ONLY (never values), and say
// which are needed to boot and which only matter for one feature. Exit code 1 only when something
// needed to boot is missing.
import { CHECKS, isPlaceholder, parseEnvFile, root } from './env-spec.mjs';
import { join } from 'node:path';

let bootProblems = 0;

for (const [group, spec] of Object.entries(CHECKS)) {
  const env = parseEnvFile(join(root, spec.file));
  console.log(`\n${spec.file}`);
  if (!env) {
    bootProblems++;
    console.log('  MISSING FILE. Run: npm run setup');
    continue;
  }

  const missing = spec.boot.filter((v) => isPlaceholder(env[v]) && !(v === 'ADMIN_DEV_BYPASS' && env[v] === 'false'));
  if (missing.length === 0) console.log('  needed to boot: all set');
  else {
    bootProblems += missing.length;
    console.log(`  NEEDED TO BOOT, missing or placeholder: ${missing.join(', ')}`);
    console.log('  Open the file and read the comment above each variable.');
  }

  if (group === 'worker') {
    if (env.APP_ENV === 'local' && env.ADMIN_DEV_BYPASS !== 'true') {
      console.log('  note: ADMIN_DEV_BYPASS is not "true", so the admin will ask for a Cloudflare Access sign-in');
    }
    if (env.APP_ENV && env.APP_ENV !== 'local') {
      console.log('  WARNING: APP_ENV is not "local". This file is for local development only.');
    }
  }

  for (const feature of spec.features) {
    const needed = feature.when(env);
    const unset = feature.vars.filter((v) => isPlaceholder(env[v]));
    if (unset.length === 0) console.log(`  ${feature.name}: configured`);
    else console.log(`  ${feature.name}: ${needed ? 'NEEDED NOW' : 'not configured'} (${unset.join(', ')}) - ${feature.hint}`);
    if (needed && unset.length) bootProblems += unset.length;
  }
}

console.log(bootProblems === 0 ? '\nOK: ready to run.' : `\n${bootProblems} problem(s) to fix before the site can run.`);
process.exit(bootProblems === 0 ? 0 : 1);
