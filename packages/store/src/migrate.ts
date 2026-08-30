/**
 * A tiny, driver-agnostic migration runner. Numbered SQL files in `./migrations/` are applied in
 * order, tracked in `_migrations`. Works against anything that can execute a raw multi-statement
 * SQL string synchronously — both `better-sqlite3`'s `Database.exec` and op-sqlite's
 * `DB.execute`/`executeBatch` satisfy this once wrapped by the caller's driver adapter (see
 * `db.ts`). Real migrations from commit one, per the wave-03 brief — not deferred until the
 * schema "settles."
 */
import fs from 'node:fs';
import path from 'node:path';

/** The minimal capability this runner needs from a driver — one synchronous multi-statement
 *  exec, and one synchronous single-row query (to read `_migrations`). */
export interface MigrationExecutor {
  exec(sql: string): void;
  /** Returns already-applied migration ids, e.g. via `SELECT id FROM _migrations`. */
  appliedIds(): string[];
  /** Records one migration as applied, e.g. `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`. */
  recordApplied(id: string, appliedAt: string): void;
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export function pendingMigrationFiles(applied: readonly string[]): string[] {
  const appliedSet = new Set(applied);
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !appliedSet.has(f));
}

/** Applies every not-yet-applied migration file, in filename order, each as its own exec call.
 *  Idempotent: safe to call on every store startup. */
export function runMigrations(executor: MigrationExecutor): void {
  executor.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = executor.appliedIds();
  for (const file of pendingMigrationFiles(applied)) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    executor.exec(sql);
    executor.recordApplied(file, new Date().toISOString());
  }
}
