/**
 * iCloud backup, local half (Track 43): turns the live database into a single consistent file to
 * upload, and swaps a downloaded backup in for the live database. Pure database-file work — the
 * native iCloud module is called by the layer above, never from here — built on the same
 * `VACUUM INTO` + verify-the-applied-migration-ids technique as `legacyDb.ts` (op-sqlite has no
 * rename and the app has no file-system dependency). Files are addressed by op-sqlite name; the
 * absolute paths native code needs come from `getDbPath()`.
 *
 * Restore ordering is the safety property: the live database is deleted only after BOTH a
 * verified copy of the incoming backup AND a verified copy of the live database itself exist, and
 * `getDb()` runs `recoverInterruptedRestore` before it opens the live file. What an interruption
 * (crash, kill, power loss) leaves behind, by step:
 *
 *   1. `previous` <- VACUUM INTO copy of the open live db, ids verified
 *        cut off: live untouched; `previous` is missing or partial and is discarded next launch.
 *   2. `staging`  <- VACUUM INTO copy of `incoming`, ids verified
 *        cut off: live untouched; both scratch files are discarded next launch.
 *   3. close the live db (checkpoints the WAL)
 *        cut off: live untouched.
 *   4. raise the swap marker; delete live; live <- VACUUM INTO copy of `staging`, ids verified;
 *      clear the marker                                   <- the only window
 *        cut off: the marker exists, so live is untrustworthy whatever its ids say (a torn copy
 *        of a same-version backup reads identically); the next launch rebuilds live from
 *        `previous` (the old data, verified), then clears the marker. The restore is rolled
 *        back, not half-applied; the user can run it again (the backup is still in iCloud).
 *   5. `getDb()` — migrates an older backup forward; clear the queued HealthKit writes and the
 *      pending-decision flag
 *        cut off: no marker, so live is kept: it holds the restored data (possibly partly
 *        migrated — migrations are idempotent per id) and scratch files are discarded next
 *        launch. The cleared flags are re-applied only by re-running restore; at worst a stale
 *        HealthKit job replays once.
 *   6. delete `incoming`, `staging`, then `previous` last
 *        cut off: leftovers are discarded next launch.
 *
 * A failure (not an interruption) after step 3 rolls back the same way, in-process, and is
 * reported as `failed`.
 */
import { open } from '@op-engineering/op-sqlite';
import { knownMigrationIds, queuesRepo, usersRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { LIVE_DB_NAME, closeDb, getLiveClient, reopenDuringRestore } from './index';
import {
  absolutePath,
  clientAppliedIds,
  copyVerified,
  deleteDb,
  isSound,
  clearSwapMarker,
  markSwapping,
  readAppliedIds,
  recoverInterruptedRestore,
  rebuildLiveFromPrevious,
  scratchNames,
} from './backupFiles';

const names = scratchNames(LIVE_DB_NAME);

/** op-sqlite name of the file the native `download` should write a backup to before
 *  `inspectSnapshot` / `restoreFromSnapshot`. */
export const RESTORE_INCOMING_NAME = names.incoming;

/** Absolute path of that file, for the native module (which takes paths, not op-sqlite names).
 *  Any stale copy is removed first so the download lands on a clean slate. */
export function prepareRestoreIncomingPath(): string {
  deleteDb(names.incoming);
  return absolutePath(names.incoming);
}

export type SnapshotInspection =
  | { kind: 'ok'; appliedIds: string[] }
  /** The backup came from a newer build: it holds migration ids this build does not ship. */
  | { kind: 'newer'; unknownIds: string[] }
  /** Not a readable Wanderlift database: unopenable, corrupt, or no `_migrations` table. */
  | { kind: 'invalid' };

/** Writes a consistent copy of the live database (WAL included) to the fixed outgoing scratch
 *  name and returns its absolute path, ready for the native `upload`. Replaces any previous
 *  snapshot; throws if the copy does not carry the same applied-migration ids as the live db. */
export function createSnapshot(): string {
  const live = getLiveClient();
  copyVerified(live, names.outgoing, clientAppliedIds(live));
  return absolutePath(names.outgoing);
}

/** Classifies the named database file (an op-sqlite name, e.g. `RESTORE_INCOMING_NAME`) without
 *  modifying it. */
export function inspectSnapshot(name: string): SnapshotInspection {
  const appliedIds = readAppliedIds(name);
  if (appliedIds === null || !isSound(name)) return { kind: 'invalid' };
  const known = new Set(knownMigrationIds());
  const unknownIds = appliedIds.filter((id) => !known.has(id));
  return unknownIds.length > 0 ? { kind: 'newer', unknownIds } : { kind: 'ok', appliedIds };
}

export type RestoreResult =
  | { kind: 'restored'; db: Db }
  /** Refused: "Update Wanderlift to restore this backup". The live db was not touched. */
  | { kind: 'newer'; unknownIds: string[] }
  /** Refused: the downloaded file is not a usable backup. The live db was not touched. */
  | { kind: 'invalid' }
  /** The swap failed and was rolled back; the live db holds its pre-restore data. */
  | { kind: 'failed'; error: string; db: Db };

/** Replaces the live database with the backup at `RESTORE_INCOMING_NAME` — ordering and
 *  interruption behavior are described in the header comment. On `restored` the returned `Db` is
 *  the new handle: every handle obtained earlier is dead, and the caller should re-read state
 *  and reschedule notifications. Only `inspectSnapshot` kind `ok` is applied; an older backup is
 *  migrated forward by `getDb()`. Also drops queued `healthkit_write` jobs (Health already syncs
 *  across the Apple ID, so replaying them would duplicate workouts) and clears
 *  `backup_decision_pending`. */
export function restoreFromSnapshot(now: string = new Date().toISOString()): RestoreResult {
  const inspection = inspectSnapshot(names.incoming);
  if (inspection.kind !== 'ok') {
    if (inspection.kind === 'invalid') deleteDb(names.incoming);
    return inspection;
  }

  // Steps 1-2: both verified copies exist before anything is closed or deleted.
  const live = getLiveClient();
  copyVerified(live, names.previous, clientAppliedIds(live));
  const incoming = open({ name: names.incoming });
  try {
    copyVerified(incoming, names.staging, inspection.appliedIds);
  } finally {
    incoming.close();
  }

  // Steps 3-5: from here a failure rolls back to `previous`.
  closeDb();
  try {
    markSwapping(LIVE_DB_NAME);
    deleteDb(LIVE_DB_NAME);
    const staging = open({ name: names.staging });
    try {
      copyVerified(staging, LIVE_DB_NAME, inspection.appliedIds);
    } finally {
      staging.close();
    }
    clearSwapMarker(LIVE_DB_NAME);
    const db = reopenDuringRestore();
    queuesRepo.deleteDeferredWorkOfKind(db, 'healthkit_write');
    usersRepo.updateUser(db, { backupDecisionPending: false }, now);
    // Step 6.
    deleteDb(names.incoming);
    deleteDb(names.staging);
    deleteDb(names.previous);
    return { kind: 'restored', db };
  } catch (e) {
    closeDb();
    rebuildLiveFromPrevious(LIVE_DB_NAME);
    return {
      kind: 'failed',
      error: e instanceof Error ? e.message : String(e),
      db: reopenDuringRestore(),
    };
  }
}

/** Removes leftover scratch files (a snapshot never uploaded, a download never restored) and
 *  finishes or rolls back any interrupted restore. Safe to call at any time the live db is not
 *  mid-restore; call it at launch and after an upload completes. */
export function cleanupScratchFiles(): void {
  recoverInterruptedRestore(LIVE_DB_NAME);
  deleteDb(names.outgoing);
  deleteDb(names.incoming);
}
