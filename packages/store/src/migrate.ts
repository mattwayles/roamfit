/**
 * A tiny, driver-agnostic migration runner. Migration SQL (embedded in `./migrations/data.ts`,
 * see ADR 0005 for why not read from disk at runtime) is applied in order, tracked in
 * `_migrations`. Works against anything that can execute a raw multi-statement SQL string
 * synchronously — both `better-sqlite3`'s `Database.exec` and op-sqlite's driver adapter satisfy
 * this once wrapped by the caller (see `db.ts`, `app/src/db/index.ts`). Real migrations from
 * commit one, per the wave-03 brief — not deferred until the schema "settles."
 */
import { MIGRATIONS } from './migrations/data';

/** The minimal capability this runner needs from a driver — one synchronous multi-statement
 *  exec, and one synchronous single-row query (to read `_migrations`). */
export interface MigrationExecutor {
  exec(sql: string): void;
  /** Returns already-applied migration ids, e.g. via `SELECT id FROM _migrations`. */
  appliedIds(): string[];
  /** Records one migration as applied, e.g. `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`. */
  recordApplied(id: string, appliedAt: string): void;
}

export function pendingMigrationFiles(applied: readonly string[]): string[] {
  const appliedSet = new Set(applied);
  return MIGRATIONS.map((m) => m.id).filter((id) => !appliedSet.has(id));
}

/** Applies every not-yet-applied migration, in order, each as its own exec call. Idempotent:
 *  safe to call on every store startup. */
export function runMigrations(executor: MigrationExecutor): void {
  executor.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = executor.appliedIds();
  const appliedSet = new Set(applied);
  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) continue;
    executor.exec(migration.sql);
    executor.recordApplied(migration.id, new Date().toISOString());
  }
}
