/**
 * Production op-sqlite wiring (ADR 0003, ADR 0004). This is the ONLY module allowed to import
 * `@op-engineering/op-sqlite` (besides its driver adapter, `opSqliteSyncDriver.ts`) — every
 * screen and hook in this app talks to the `Db` handle this file produces, through
 * `@roamfit/store`'s repository functions, never through op-sqlite directly and never with a
 * hand-rolled SQL query of its own (CLAUDE.md: no new persistence logic in `app/`).
 */
import { open } from '@op-engineering/op-sqlite';
import { schema } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { runMigrations } from '@roamfit/store';
import type { MigrationExecutor } from '@roamfit/store';
import { drizzleOpSqlite } from './opSqliteSyncDriver';

const DB_NAME = 'roamfit.sqlite';

let dbInstance: Db | null = null;

/** Opens (or returns the already-open) on-device database, applying any pending migrations.
 *  Idempotent and cheap to call more than once — callers should still hold onto the returned
 *  handle rather than re-invoking this on every render. */
export function getDb(): Db {
  if (dbInstance) return dbInstance;

  const client = open({ name: DB_NAME });
  client.executeSync('PRAGMA journal_mode = WAL');
  client.executeSync('PRAGMA foreign_keys = ON');

  const executor: MigrationExecutor = {
    exec: (sql) => client.executeSync(sql),
    appliedIds: () =>
      (client.executeSync('SELECT id FROM _migrations').rows as { id: string }[]).map((r) => r.id),
    recordApplied: (id, appliedAt) =>
      client.executeSync('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [id, appliedAt]),
  };
  runMigrations(executor);

  dbInstance = drizzleOpSqlite(client, { schema }) as unknown as Db;
  return dbInstance;
}

/** Test/dev-only escape hatch — never call this from app code, only from a script that
 *  deliberately wants a fresh on-device db (e.g. a manual reset during development). */
export function __resetDbInstanceForTesting(): void {
  dbInstance = null;
}
