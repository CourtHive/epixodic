/**
 * migrationRunner — fail-closed directory handling.
 *
 * No Postgres needed: the pool is a stub that answers the tracking-table
 * queries. The real apply path is covered by storage.test.ts against Postgres.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrationRunner.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

function stubPool(): any {
  return { query: async () => ({ rows: [] }) };
}

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crowd-migrations-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('refuses to start when the migrations directory is missing', async () => {
    const migrationsDir = join(tempDir(), 'absent');
    await expect(runMigrations(stubPool(), { migrationsDir, logger: () => {} })).rejects.toThrow(
      /migrations directory not found/,
    );
  });

  it('refuses to start when the migrations directory holds no .sql files', async () => {
    const migrationsDir = tempDir();
    writeFileSync(join(migrationsDir, 'README.md'), 'not a migration');
    await expect(runMigrations(stubPool(), { migrationsDir, logger: () => {} })).rejects.toThrow(/no \.sql files/);
  });

  it('ships the default migrations directory next to the runner', async () => {
    // Runs from src/ under vitest; the build copies the same files to dist/.
    const here = dirname(fileURLToPath(import.meta.url));
    const applied = readdirSync(join(here, 'migrations')).filter((f) => f.endsWith('.sql'));
    expect(applied.length).toBeGreaterThan(0);
    const pool: any = {
      query: async (sql: string) =>
        sql.startsWith('SELECT name') ? { rows: applied.map((name) => ({ name })) } : { rows: [] },
    };
    const messages: string[] = [];
    await runMigrations(pool, { logger: (m) => messages.push(m) });
    expect(messages).toContain('all migrations up to date');
  });
});
