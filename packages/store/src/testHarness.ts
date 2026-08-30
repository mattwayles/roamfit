/**
 * Node test harness — an in-memory `better-sqlite3` database, migrated fresh, wrapped as a
 * Drizzle `Db`. This is the "in-memory or better-sqlite3-backed test harness" the wave-03 brief
 * asks for, and the only place in this package that imports `better-sqlite3` directly (see ADR
 * 0003 — production wiring is a separate op-sqlite adapter in `app/src/db/`, not this file).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

function openAndMigrate(filename: string): TestDb {
  const raw = new Database(filename);
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

export function createTestDb(): TestDb {
  return openAndMigrate(':memory:');
}

/**
 * Carried-forward issue #10 (docs/ORCHESTRATION.md): `createTestDb` is `:memory:` only, so a
 * test built on it reuses one live connection end-to-end and can never actually prove
 * durability — closing an in-memory handle discards the database, it doesn't "persist" it.
 *
 * `createFileTestDb` opens a real file on disk (in a fresh per-call temp directory) so a test
 * can close the connection — simulating a force-quit, where nothing in-memory survives — and
 * then cold-reopen the *same file* to prove the committed rows are actually still there. Call
 * `reopen()` after `close()`; it returns a brand-new connection/Drizzle handle bound to the same
 * file, with no migration re-run needed (the `_migrations` table is already on disk).
 */
export interface FileTestDb extends TestDb {
  filename: string;
  /** Close the current connection and open a fresh one against the same file on disk. */
  reopen: () => FileTestDb;
}

export function createFileTestDb(): FileTestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roamfit-store-test-'));
  const filename = path.join(dir, 'roamfit.sqlite');
  return wrapFileTestDb(openAndMigrate(filename), filename);
}

function wrapFileTestDb(inner: TestDb, filename: string): FileTestDb {
  return {
    ...inner,
    filename,
    reopen: () => {
      inner.close();
      // Re-open against the same on-disk file with a brand-new connection — nothing from the
      // old process-local handle (WAL cache, prepared statements, in-flight transactions) is
      // reused, matching a real cold app boot after a force-quit.
      return wrapFileTestDb(openAndMigrate(filename), filename);
    },
  };
}
