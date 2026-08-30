/**
 * Node test harness — an in-memory `better-sqlite3` database, migrated fresh, wrapped as a
 * Drizzle `Db`. This is the "in-memory or better-sqlite3-backed test harness" the wave-03 brief
 * asks for, and the only place in this package that imports `better-sqlite3` directly (see ADR
 * 0003 — production wiring is a separate op-sqlite adapter in `app/src/db/`, not this file).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from './migrate';
import type { MigrationExecutor } from './migrate';
import * as schema from './schema';
import type { Db } from './db';

export interface TestDb {
  db: Db;
  raw: Database.Database;
  close: () => void;
}

export function createTestDb(): TestDb {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  const executor: MigrationExecutor = {
    exec: (sql) => raw.exec(sql),
    appliedIds: () =>
      (raw.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id),
    recordApplied: (id, appliedAt) =>
      raw.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(id, appliedAt),
  };
  runMigrations(executor);

  const db = drizzle(raw, { schema }) as unknown as Db;
  return { db, raw, close: () => raw.close() };
}
