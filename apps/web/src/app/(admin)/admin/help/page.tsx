import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';

/**
 * Admin Help, generated at build time from docs/ADMIN_GUIDE.md so it always matches the guide.
 * The build runs from apps/web, so the guide is two folders up.
 */
function loadGuide(): string {
  const file = path.join(process.cwd(), '..', '..', 'docs', 'ADMIN_GUIDE.md');
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '# Help\n\nThe admin guide could not be found. It lives in docs/ADMIN_GUIDE.md.';
  }
}

export default function Page() {
  return <article className="max-w-3xl">{renderMarkdown(loadGuide())}</article>;
}
