/**
 * Whole-file helpers behind iCloud backup (Track 43), in the style of `legacyDb.ts`: op-sqlite has
 * no rename and this app carries no file-system dependency, so database files are copied with
 * `VACUUM INTO` and removed with `delete()`, and every copy is verified by comparing the
 * applied-migration ids in `_migrations`. Files are addressed by op-sqlite NAME (the paths native
 * code needs come from `getDbPath()`), never by absolute path.
 *
 * This file holds the scratch-file names, the primitives, and `recoverInterruptedRestore`, which
 * `getDb()` calls before it opens the live database. It lives apart from `backup.ts` only so
 * `index.ts` can import it without an import cycle (`backup.ts` imports `index.ts`). The restore
 * sequence these serve, and what an interruption leaves behind at each step, is documented on
 * `restoreFromSnapshot` in `backup.ts`.
 *
 * `VACUUM INTO` refuses a target that already has content, so every target is deleted first and
 * `open` then creates the empty file it accepts (see `legacyDb.ts`).
 */
import { open } from '@op-engineering/op-sqlite';

export type Client = ReturnType<typeof open>;

/** The four scratch databases, named after the live one so Jest's per-file live names keep them
 *  per-file too (and the production names are `wanderlift-backup-outgoing.sqlite` etc.). */
export function scratchNames(liveName: string) {
  const base = liveName.replace(/\.sqlite$/, '');
  return {
    /** Snapshot of the live db awaiting upload. */
    outgoing: `${base}-backup-outgoing.sqlite`,
    /** Where the native `download` puts a backup awaiting restore. */
    incoming: `${base}-restore-incoming.sqlite`,
    /** Verified copy of `incoming`, the source for the swap. */
    staging: `${base}-restore-staging.sqlite`,
    /** Verified copy of the live db taken just before the swap — the rollback source. */
    previous: `${base}-restore-previous.sqlite`,
  };
}

/** Applied migration ids of the named db, sorted; null if it has no `_migrations` table or is not
 *  a readable database at all. Opening creates an empty file if none exists — callers that may
 *  have seen a missing file delete the name afterwards. */
export function readAppliedIds(name: string): string[] | null {
  const client = open({ name });
  try {
    const hasTable = client.executeSync(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
    ).rows;
    if (hasTable.length === 0) return null;
    return (client.executeSync('SELECT id FROM _migrations ORDER BY id').rows as { id: string }[])
      .map((r) => r.id)
      .sort();
  } catch {
    return null; // e.g. "file is not a database"
  } finally {
    client.close();
  }
}

/** Applied migration ids of an already-open client, sorted. */
export function clientAppliedIds(client: Client): string[] {
  return (client.executeSync('SELECT id FROM _migrations ORDER BY id').rows as { id: string }[])
    .map((r) => r.id)
    .sort();
}

/** True unless SQLite's `PRAGMA quick_check` reports a problem with the named db (or the db cannot
 *  be queried at all). quick_check yields a single `ok` row when sound; the Jest driver returns no
 *  rows for PRAGMAs, which is read as "nothing reported". */
export function isSound(name: string): boolean {
  const client = open({ name });
  try {
    const rows = client.executeSync('PRAGMA quick_check').rows as Record<string, unknown>[];
    return rows.every((r) => Object.values(r)[0] === 'ok');
  } catch {
    return false;
  } finally {
    client.close();
  }
}

export function absolutePath(name: string): string {
  const client = open({ name });
  const path = client.getDbPath();
  client.close();
  return path;
}

/** Removes the named db (and its WAL/SHM files). Safe when it does not exist. */
export function deleteDb(name: string): void {
  const client = open({ name });
  client.close();
  client.delete();
}

/** Writes a consistent copy of `source` to a freshly emptied `targetName`, then checks the copy
 *  carries exactly the ids in `expectedIds`. Throws (leaving the half-made target for the caller
 *  to delete) if it does not verify. */
export function copyVerified(source: Client, targetName: string, expectedIds: string[]): void {
  deleteDb(targetName);
  const targetPath = absolutePath(targetName);
  source.executeSync(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);
  const copied = readAppliedIds(targetName);
  if (copied === null || copied.join('\n') !== expectedIds.join('\n')) {
    throw new Error(`Copy to ${targetName} did not verify.`);
  }
}

/** Rebuilds the live db from the pre-swap copy and clears every restore scratch file. Throws if
 *  the rebuilt file does not verify (the pre-swap copy is then kept). */
export function rebuildLiveFromPrevious(liveName: string): void {
  const names = scratchNames(liveName);
  const previousIds = readAppliedIds(names.previous);
  if (previousIds === null) throw new Error('No usable pre-restore copy to roll back to.');
  const previous = open({ name: names.previous });
  try {
    copyVerified(previous, liveName, previousIds);
  } finally {
    previous.close();
  }
  deleteDb(names.staging);
  deleteDb(names.previous);
}

/**
 * Completes or undoes a restore that was cut off, before the live db is opened. The pre-swap copy
 * (`previous`) exists only while a swap may be in flight, so its absence means there is nothing to
 * do. When it is present:
 *  - the live db is sound and carries the staged (restored) ids, or the pre-swap ids → the swap
 *    either finished or never started; keep live and clear the scratch files;
 *  - otherwise (live missing, empty, unsound, or a stranger) → the swap died mid-copy; rebuild
 *    live from the pre-swap copy. The restore is rolled back, never half-applied, and the user
 *    can simply run it again.
 * A `previous` that is itself partial (cut off while being made) can only coexist with a still
 * untouched live db, which this leaves alone.
 */
export function recoverInterruptedRestore(liveName: string): void {
  const names = scratchNames(liveName);
  const previousIds = readAppliedIds(names.previous);
  if (previousIds === null) {
    deleteDb(names.previous); // drop the stub `open` just made, or a partial copy
    deleteDb(names.staging);
    return;
  }
  const liveIds = readAppliedIds(liveName);
  const stagedIds = readAppliedIds(names.staging); // null once cleanup has begun
  const liveHealthy =
    liveIds !== null &&
    isSound(liveName) &&
    (liveIds.join('\n') === previousIds.join('\n') ||
      stagedIds === null ||
      liveIds.join('\n') === stagedIds.join('\n'));
  if (liveHealthy) {
    deleteDb(names.staging);
    deleteDb(names.previous);
    return;
  }
  deleteDb(liveName);
  rebuildLiveFromPrevious(liveName);
}
