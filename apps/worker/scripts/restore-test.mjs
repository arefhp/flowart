// npm run restore-test -w apps/worker
// Proves a backup is usable: exports the LOCAL database to SQL, loads that SQL into a brand-new scratch
// database (separate folder) and compares the row count of every table. Never touches production.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..');
// run wrangler's own script with node: no shell, so quotes in the SQL are passed through untouched
const bin = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
const wrangler = (args) => execFileSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const scratch = mkdtempSync(join(tmpdir(), 'flowart-restore-'));
const dump = join(scratch, 'dump.sql');

function counts(persist) {
  const out = wrangler(['d1', 'execute', 'DB', '--local', ...(persist ? ['--persist-to', persist] : []), '--json', '--command',
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name`]);
  const tables = JSON.parse(out)[0].results.map((r) => r.name);
  // one small query per table (a single UNION of every table exceeds SQLite's compound-select limit)
  const result = {};
  for (const t of tables) {
    const res = wrangler(["d1", "execute", "DB", "--local", ...(persist ? ["--persist-to", persist] : []), "--json", "--command", `SELECT COUNT(*) AS n FROM "${t}"`]);
    result[t] = JSON.parse(res)[0].results[0].n;
  }
  return result;
}

try {
  if (!existsSync(join(cwd, '.wrangler', 'state'))) throw new Error('No local database yet. Run: npm run migrate:local && npm run seed');
  const before = counts();
  // DATA-ONLY dump: a full dump inserts rows into a table before its parent table exists, which foreign keys reject
  wrangler(['d1', 'export', 'DB', '--local', '--no-schema', '--output', dump]);
  const bytes = readFileSync(dump).length;
  const scratchDb = join(scratch, 'state');
  // restore = 1) schema from the migrations into a new empty database, 2) load the data
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', scratchDb]);
  // the migrations also insert starter rows (categories, About text ...); the dump carries the real ones
  const tables = Object.keys(before);
  const wipe = join(scratch, 'wipe.sql');
  writeFileSync(wipe, ['PRAGMA defer_foreign_keys=TRUE;', ...tables.map((t) => `DELETE FROM "${t}";`), 'DELETE FROM d1_migrations;'].join('\n'));
  wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', scratchDb, '--file', wipe]);
  wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', scratchDb, '--file', dump]);
  const after = counts(scratchDb);
  let bad = 0;
  for (const [t, n] of Object.entries(before)) {
    const ok = after[t] === n;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${t}: ${n} rows -> ${after[t] ?? 'missing'}`);
  }
  console.log(bad === 0 ? `\nRestore test passed (${bytes} byte dump restored into a fresh database).` : `\n${bad} table(s) differ.`);
  process.exitCode = bad === 0 ? 0 : 1;
} catch (e) {
  console.error("Restore test failed:", String(e.message).slice(0, 120));
  console.error(String(e.stdout || "").slice(0, 600));
  console.error(String(e.stderr || "").slice(0, 600));
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
