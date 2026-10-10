// Fails when the Worker code reads an environment variable that is missing from
// .dev.vars.example or from the AppEnv type (spec section 19.0).
// Run by `npm test` in apps/worker. Prints variable names only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const used = new Set();
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\b(?:env|this\.env|c\.env)\.([A-Z][A-Z0-9_]+)\b/g)) used.add(m[1]);
}
// Bindings are not variables.
for (const binding of ['DB', 'MEDIA', 'PRIVATE', 'ASSETS']) used.delete(binding);

const example = readFileSync(join(root, '.dev.vars.example'), 'utf8');
const inExample = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

const envType = readFileSync(join(root, 'src', 'env.ts'), 'utf8');
const inType = new Set([...envType.matchAll(/^\s+([A-Z][A-Z0-9_]+)\??:/gm)].map((m) => m[1]));

const problems = [];
for (const name of [...used].sort()) {
  if (!inExample.has(name)) problems.push(`${name}: read by the code but missing from .dev.vars.example`);
  if (!inType.has(name)) problems.push(`${name}: read by the code but missing from the Env type (src/env.ts)`);
}
for (const name of [...inExample].sort()) {
  if (!inType.has(name)) problems.push(`${name}: in .dev.vars.example but missing from the Env type (src/env.ts)`);
}

if (problems.length) {
  console.error('Environment variable check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`Environment variable check passed (${used.size} variables read by the Worker).`);
