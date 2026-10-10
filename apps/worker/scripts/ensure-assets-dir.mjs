// `wrangler dev` fails when its assets directory does not exist. Locally the website runs on Next
// (:3000) and the Worker only serves the API, so it gets its own EMPTY assets folder. This also
// keeps Wrangler from holding a lock on apps/web/out, which `npm run build` needs to replace.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, '..', '.local-assets'), { recursive: true });
mkdirSync(join(here, '..', '..', 'web', 'out'), { recursive: true });
