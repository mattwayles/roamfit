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
import { runMigrations, newId } from '@roamfit/store';
import type { MigrationExecutor } from '@roamfit/store';
import { drizzleOpSqlite } from './opSqliteSyncDriver';

/**
 * Test isolation (see docs/handoff/STATUS-4-loop.md — "npm run check hung when run concurrently
 * with another `npm run check`"): several app tests (`HomeScreen.test.tsx`,
 * `WorkoutScreen.rest.test.tsx`, `WorkoutScreen.resume.test.tsx`) deliberately exercise this real
 * op-sqlite driver against a real file — that's what caught the `node:fs` Metro bug and the
 * feedback-clear bug — but a *fixed* filename meant every test file, and every concurrently
 * running Jest process (two agents, or a watch process plus a CI run), raced on the one physical
 * `roamfit.sqlite`. `maxWorkers: 1` in `app/jest.config.js` only serialized files within a single
 * Jest *process*; it could not and did not prevent two separate processes from colliding.
 *
 * Under Jest, `process.env.JEST_WORKER_ID` is always set — this branch gives every test file its
 * own uniquely-named db (Jest resets the module registry per test file, so this runs once per
 * file, computing a name that's unique to this process/worker/file combination). `JEST_WORKER_ID`
 * is never set outside Jest, so the real app always uses the stable production filename.
 * `newId()` (already the store's own id generator — no new dependency) supplies the randomness;
 * deliberately not `node:crypto`, which — like `node:fs` before it — has no Metro/Hermes
 * equivalent and would break the real on-device bundle if imported here (see ADR 0005).
 */
const DB_NAME =
  process.env.JEST_WORKER_ID !== undefined
    ? `roamfit-test-${process.env.JEST_WORKER_ID}-${newId()}.sqlite`
    : 'roamfit.sqlite';

let dbInstance: Db | null = null;

/** op-sqlite's `executeSync` — unlike `better-sqlite3`'s `Database.exec`, which
 *  `packages/store/src/migrate.ts`'s `MigrationExecutor.exec` contract was modeled on — only
 *  accepts a single SQL statement per call; discovered by an actual failing test
 *  (`HomeScreen.test.tsx`, "SQL Error: The supplied SQL string contains more than one
 *  statement") when a migration file's multi-`CREATE TABLE` script hit this driver for real.
 *  Each `packages/store/src/migrations/*.sql` file is our own content with no triggers or
 *  stored procedures (confirmed — no `BEGIN...END` blocks), so a plain split on `;` is safe:
 *  every semicolon in these files really does terminate one statement. */
function execMultiStatement(client: ReturnType<typeof open>, sql: string): void {
  // op-sqlite's `executeSync` rejects a leading `-- comment` line even ahead of a single valid
  // statement (found empirically — `HomeScreen.test.tsx` against the real migration files, which
  // open with a multi-line header comment before the first `CREATE TABLE`), unlike
  // `better-sqlite3`'s `.exec()`, which tolerates comments anywhere. Strip full-line `--`
  // comments before splitting, rather than relying on the driver to skip them.
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of withoutComments.split(';')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) client.executeSync(trimmed);
  }
}

/** Opens (or returns the already-open) on-device database, applying any pending migrations.
 *  Idempotent and cheap to call more than once — callers should still hold onto the returned
 *  handle rather than re-invoking this on every render. */
export function getDb(): Db {
  if (dbInstance) return dbInstance;

  const client = open({ name: DB_NAME });
  client.executeSync('PRAGMA journal_mode = WAL');
  client.executeSync('PRAGMA foreign_keys = ON');
  // Defense in depth alongside the per-process db name above: if anything ever DOES contend on
  // one physical file (e.g. a future change reintroduces a fixed path), a locked db should fail
  // fast with a clear SQLITE_BUSY error within a few seconds, not hang indefinitely — a hung
  // `npm run check` reads as "the environment is broken," not as a bug report.
  client.executeSync('PRAGMA busy_timeout = 5000');

  const executor: MigrationExecutor = {
    exec: (sql) => execMultiStatement(client, sql),
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
