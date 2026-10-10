// Next caches the API responses it fetches during a build (.next/cache/fetch-cache). If that cache
// survived into the next build, a rebuild after an admin change could publish OLD content.
// `npm run build` clears it first, so every build reads the API fresh.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(webDir, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true });
