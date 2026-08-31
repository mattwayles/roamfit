/**
 * `migrations/data.ts` embeds each migration's SQL as a TS string constant (ADR 0005) so
 * `migrate.ts` has zero `node:fs`/`node:path` dependency and works unmodified under Metro (the
 * real app) as well as node (tests). The `.sql` files in `./migrations/` are kept alongside
 * purely as reviewable source — this test is the guardrail that stops the two from silently
 * drifting apart, since nothing else enforces it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations/data';
import { pendingMigrationFiles, runMigrations } from './migrate';
import type { MigrationExecutor } from './migrate';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

describe('migrations/data.ts stays byte-for-byte in sync with the .sql files', () => {
  it('every migration id has a matching .sql file with identical content', () => {
    for (const migration of MIGRATIONS) {
      const filePath = path.join(MIGRATIONS_DIR, migration.id);
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      expect(migration.sql).toBe(fileContent);
    }
  });

  it('no .sql file in the directory is missing from MIGRATIONS', () => {
    const sqlFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const dataIds = MIGRATIONS.map((m) => m.id).sort();
    expect(sqlFiles).toEqual(dataIds);
  });
});

describe('runMigrations / pendingMigrationFiles (embedded-data driven)', () => {
  it('pendingMigrationFiles excludes already-applied ids and preserves order', () => {
    expect(pendingMigrationFiles([])).toEqual(MIGRATIONS.map((m) => m.id));
    expect(pendingMigrationFiles([MIGRATIONS[0].id])).toEqual(MIGRATIONS.slice(1).map((m) => m.id));
    expect(pendingMigrationFiles(MIGRATIONS.map((m) => m.id))).toEqual([]);
  });

  it('runMigrations applies every migration exactly once and records each id', () => {
    const execCalls: string[] = [];
    const recorded: string[] = [];
    let applied: string[] = [];
    const executor: MigrationExecutor = {
      exec: (sql) => execCalls.push(sql),
      appliedIds: () => applied,
      recordApplied: (id) => {
        recorded.push(id);
        applied = [...applied, id];
      },
    };

    runMigrations(executor);
    expect(recorded).toEqual(MIGRATIONS.map((m) => m.id));
    // One exec for the _migrations bootstrap table, plus one per migration.
    expect(execCalls).toHaveLength(MIGRATIONS.length + 1);

    // Idempotent: calling again with the same executor (now reporting everything applied)
    // records nothing new.
    const recordedBefore = recorded.length;
    runMigrations(executor);
    expect(recorded).toHaveLength(recordedBefore);
  });
});
