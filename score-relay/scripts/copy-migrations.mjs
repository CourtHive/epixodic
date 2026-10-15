// tsc compiles only .ts, so the crowd SQL migrations never reached dist/ and the
// deployed relay ran with no crowd tables. Copy them next to the compiled runner.
import { cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src/crowd/migrations');
const to = join(root, 'dist/crowd/migrations');

cpSync(from, to, { recursive: true });

const copied = readdirSync(to).filter((f) => f.endsWith('.sql'));
if (copied.length === 0) {
  console.error(`[copy-migrations] no .sql files landed in ${to}`);
  process.exit(1);
}
console.log(`[copy-migrations] ${copied.length} migration(s) -> dist/crowd/migrations`);
