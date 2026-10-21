/**
 * Production op-sqlite wiring (ADR 0003, ADR 0004). This is the ONLY module allowed to import
 * `@op-engineering/op-sqlite` (besides its driver adapter, `opSqliteSyncDriver.ts`, and the two
 * whole-file helpers `legacyDb.ts` and `backup.ts` / `backupFiles.ts`, which copy database files
 * with `VACUUM INTO` and never touch the `Db` handle) — every
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
import { migrateLegacyDb } from './legacyDb';
import { recoverInterruptedRestore } from './backupFiles';

/**
 * Test isolation (see docs/handoff/STATUS-4-loop.md — "npm run check hung when run concurrently
 * with another `npm run check`"): several app tests (`HomeScreen.test.tsx`,
 * `WorkoutScreen.rest.test.tsx`, `WorkoutScreen.resume.test.tsx`) deliberately exercise this real
 * op-sqlite driver against a real file — that's what caught the `node:fs` Metro bug and the
 * feedback-clear bug — but a *fixed* filename meant every test file, and every concurrently
 * running Jest process (two agents, or a watch process plus a CI run), raced on the one physical
 * `wanderlift.sqlite`. `maxWorkers: 1` in `app/jest.config.js` only serialized files within a single
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
export const LIVE_DB_NAME =
  process.env.JEST_WORKER_ID !== undefined
    ? `roamfit-test-${process.env.JEST_WORKER_ID}-${newId()}.sqlite`
    : 'wanderlift.sqlite';

/** The pre-rename production filename; see `migrateLegacyDb`. */
const LEGACY_DB_NAME = 'roamfit.sqlite';

let dbInstance: Db | null = null;
/** The op-sqlite client behind `dbInstance`; kept so `closeDb()` can close it and so `backup.ts`
 *  can run `VACUUM INTO` on the live database. Module-internal by convention — see
 *  `getLiveClient`. */
/** Set only by `reopenDuringRestore`: a restore in progress owns the scratch files, so the reopen
 *  must not run recovery (which would delete the rollback copy it still needs). */
let skipRecovery = false;
let clientInstance: ReturnType<typeof open> | null = null;

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

  if (process.env.JEST_WORKER_ID === undefined) migrateLegacyDb(LEGACY_DB_NAME, LIVE_DB_NAME);
  // A restore that was cut off mid-swap may have left no usable live file; put it right before
  // the open below would create an empty one. A no-op unless restore scratch files exist.
  if (!skipRecovery) recoverInterruptedRestore(LIVE_DB_NAME);

  const client = open({ name: LIVE_DB_NAME });
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
  try {
    runMigrations(executor);
  } catch (e) {
    client.close(); // don't leak an open handle on a db that cannot be brought up to date
    throw e;
  }

  clientInstance = client;
  dbInstance = drizzleOpSqlite(client, { schema }) as unknown as Db;
  return dbInstance;
}

/** `getDb()` for `restoreFromSnapshot` only: reopens the live file mid-restore without
 *  interrupted-restore recovery. */
export function reopenDuringRestore(): Db {
  skipRecovery = true;
  try {
    return getDb();
  } finally {
    skipRecovery = false;
  }
}

/** The raw client behind the handle `getDb()` returns, opening the database first if needed.
 *  For `backup.ts` only (it must run `VACUUM INTO` on the live file); everything else goes
 *  through the `Db` handle. */
export function getLiveClient(): ReturnType<typeof open> {
  getDb();
  return clientInstance!;
}

/** Closes the live database and forgets the handle, so the file can be replaced (iCloud
 *  restore). Any `Db` previously returned by `getDb()` is dead after this — callers must take
 *  the new one from the next `getDb()` (or from `restoreFromSnapshot`). No-op when not open. */
export function closeDb(): void {
  if (clientInstance) clientInstance.close();
  clientInstance = null;
  dbInstance = null;
}

/** Test/dev-only escape hatch — never call this from app code, only from a script that
 *  deliberately wants a fresh on-device db (e.g. a manual reset during development). */
export function __resetDbInstanceForTesting(): void {
  dbInstance = null;
  clientInstance = null;
}
