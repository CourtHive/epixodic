/**
 * Crowd-storage migration runner.
 *
 * Mirrors competition-factory-server's MigrationRunnerService but as a
 * plain function — score-relay is not NestJS. On call, reads every
 * `.sql` file in `migrations/`, tracks applied migrations in a
 * `crowd.schema_migrations` table, and applies pending ones in
 * filename order. Each migration runs in its own transaction; failure
 * aborts startup loudly.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = join(__dirname, 'migrations');

/** Override the migrations directory (useful for tests). */
export interface MigrationRunnerOptions {
  migrationsDir?: string;
  logger?: (message: string) => void;
}

export async function runMigrations(pool: Pool, options: MigrationRunnerOptions = {}): Promise<void> {
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const log = options.logger ?? ((message: string) => console.log(`[crowd-migrations] ${message}`));

  await ensureTrackingTable(pool);
  const applied = await getAppliedMigrations(pool);
  const pending = await getPendingMigrations(migrationsDir, applied, log);

  if (pending.length === 0) {
    log('all migrations up to date');
    return;
  }

  log(`applying ${pending.length} pending migration(s)...`);
  for (const migration of pending) {
    await applyMigration(pool, migration, log);
  }
  log('all migrations applied successfully');
}

async function ensureTrackingTable(pool: Pool): Promise<void> {
  // The crowd schema itself is created by 001-crowd-scoring.sql, but the
  // tracking table needs a home before any migration has run. Create the
  // schema here too (idempotent) so the tracker can land first.
  await pool.query('CREATE SCHEMA IF NOT EXISTS crowd');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crowd.schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>('SELECT name FROM crowd.schema_migrations ORDER BY name');
  return new Set(result.rows.map((r) => r.name));
}

interface PendingMigration {
  name: string;
  path: string;
}

async function getPendingMigrations(
  migrationsDir: string,
  applied: Set<string>,
  log: (message: string) => void,
): Promise<PendingMigration[]> {
  let files: string[];
  try {
    files = await readdir(migrationsDir);
  } catch {
    log(`migrations directory not found: ${migrationsDir}`);
    return [];
  }

  return files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f))
    .map((f) => ({ name: f, path: join(migrationsDir, f) }));
}

async function applyMigration(pool: Pool, migration: PendingMigration, log: (message: string) => void): Promise<void> {
  const sql = await readFile(migration.path, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO crowd.schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [migration.name],
    );
    await client.query('COMMIT');
    log(`applied: ${migration.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`crowd migration ${migration.name} failed — server cannot start: ${message}`);
  } finally {
    client.release();
  }
}
