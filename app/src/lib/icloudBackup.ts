/**
 * iCloud backup scheduler (Track 43): the glue between the native iCloud module and the local
 * snapshot layer in `db/backup.ts`. It decides WHETHER a backup may run; the two halves it joins
 * know how. Everything here is best effort and never throws — backup is a convenience on top of an
 * offline-first app (CLAUDE.md invariant 1), so a failure becomes an outcome the caller may show
 * calmly, never an error that interrupts a workout.
 *
 * The safety rule is `icloudBackupLinked`: until this device's data has been reconciled with
 * iCloud (uploaded once, restored, or kept on purpose), an upload is only allowed when NO backup
 * exists. If one does, the upload is refused and `backup_decision_pending` is raised for the
 * restore flow — so a fresh install or a second phone can never overwrite real data with an empty
 * or different database, whatever the timing of launch, onboarding and the first trigger.
 */
import { usersRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import * as iCloud from '../../modules/icloud-backup';
import type { BackupStat, BackupWhich } from '../../modules/icloud-backup';
import {
  cleanupScratchFiles,
  createSnapshot,
  prepareRestoreIncomingPath,
  restoreFromSnapshot,
} from '../db/backup';
import type { RestoreResult } from '../db/backup';
import { getDb } from '../db';

export type BackupReason = 'session-complete' | 'background' | 'manual';

export type BackupSkipReason =
  'disabled' | 'onboarding' | 'decision-pending' | 'throttled' | 'in-flight' | 'unavailable';

export type BackupOutcome =
  /** A new backup is in iCloud; `at` is the upload time in epoch milliseconds. */
  | { kind: 'uploaded'; at: number }
  | { kind: 'skipped'; why: BackupSkipReason }
  /** A backup from another phone exists and this device was never reconciled with it: nothing was
   *  uploaded and `backup_decision_pending` is now set. */
  | { kind: 'needs-decision' }
  | { kind: 'failed' };

/** Background backups run at most this often; completing a workout and "Back up now" ignore it. */
export const BACKGROUND_THROTTLE_MS = 15 * 60 * 1000;

let lastBackgroundAttemptAt: number | null = null;
let busy = false;

/** Test isolation: forgets the throttle clock and any in-flight marker. */
export function __resetBackupSchedulerForTesting(): void {
  lastBackgroundAttemptAt = null;
  busy = false;
}

/** Runs one backup if every guard allows it (see the file header). Never rejects. */
export async function runBackup(
  db: Db,
  opts: { reason: BackupReason; now?: Date },
): Promise<BackupOutcome> {
  const now = opts.now ?? new Date();
  try {
    const user = usersRepo.getUser(db);
    if (!user || !user.icloudBackupEnabled) return { kind: 'skipped', why: 'disabled' };
    if (!user.hasAcknowledgedDisclaimer || user.onboardingInProgress) {
      return { kind: 'skipped', why: 'onboarding' };
    }
    if (user.backupDecisionPending) return { kind: 'skipped', why: 'decision-pending' };
    if (
      opts.reason === 'background' &&
      lastBackgroundAttemptAt !== null &&
      now.getTime() - lastBackgroundAttemptAt < BACKGROUND_THROTTLE_MS
    ) {
      return { kind: 'skipped', why: 'throttled' };
    }
    if (busy) return { kind: 'skipped', why: 'in-flight' };

    busy = true;
    try {
      if (opts.reason === 'background') lastBackgroundAttemptAt = now.getTime();
      if (!(await iCloud.isAvailable())) return { kind: 'skipped', why: 'unavailable' };

      if (!user.icloudBackupLinked && (await iCloud.stat('latest')) !== null) {
        usersRepo.updateUser(db, { backupDecisionPending: true }, now.toISOString());
        return { kind: 'needs-decision' };
      }

      const path = createSnapshot();
      await iCloud.upload(path);
      usersRepo.updateUser(db, { icloudBackupLinked: true }, now.toISOString());
      cleanupScratchFiles();
      return { kind: 'uploaded', at: now.getTime() };
    } finally {
      busy = false;
    }
  } catch {
    return { kind: 'failed' };
  }
}

export interface BackupStatus {
  available: boolean;
  /** When the latest backup in iCloud was written (epoch ms), or null if there is none. */
  lastBackedUpAt: number | null;
}

/** What Settings shows: whether iCloud is reachable and when the newest backup landed. */
export async function getBackupStatus(): Promise<BackupStatus> {
  try {
    if (!(await iCloud.isAvailable())) return { available: false, lastBackedUpAt: null };
    const latest = await iCloud.stat('latest');
    return { available: true, lastBackedUpAt: latest?.modifiedAt ?? null };
  } catch {
    return { available: false, lastBackedUpAt: null };
  }
}

/** Fresh-install path: when this device was never reconciled and iCloud already holds a backup,
 *  raises `backup_decision_pending` (no upload can run until the user chooses) and returns the
 *  backup's metadata so the welcome screen can offer it. Null when there is nothing to offer. */
export async function checkForExistingBackup(
  db: Db,
  now: Date = new Date(),
): Promise<BackupStat | null> {
  try {
    const user = usersRepo.getUser(db);
    if (!user || user.icloudBackupLinked) return null;
    if (!(await iCloud.isAvailable())) return null;
    const existing = await iCloud.stat('latest');
    if (existing) usersRepo.updateUser(db, { backupDecisionPending: true }, now.toISOString());
    return existing;
  } catch {
    return null;
  }
}

/** "Keep this phone's data": this device is now the source of truth, so backups may overwrite what
 *  iCloud holds. */
export function keepThisPhonesData(db: Db, now: Date = new Date()): void {
  usersRepo.updateUser(
    db,
    { icloudBackupLinked: true, backupDecisionPending: false },
    now.toISOString(),
  );
}

export type DownloadRestoreResult =
  | RestoreResult
  /** iCloud holds no such backup. */
  | { kind: 'none' }
  | { kind: 'unavailable' }
  /** The download did not complete (offline, evicted file timed out); nothing was changed. */
  | { kind: 'download-failed' };

/** Downloads a stored backup and swaps it in for the live database (`restoreFromSnapshot` has the
 *  safety details). On `restored` the returned `Db` is the only valid handle, already marked
 *  linked — whatever the other phone's flag said, this device now matches iCloud. Never rejects. */
export async function downloadAndRestore(
  which: BackupWhich = 'latest',
  now: Date = new Date(),
): Promise<DownloadRestoreResult> {
  const wasBusy = busy;
  busy = true; // no upload while the live database is being replaced
  try {
    let found: boolean;
    try {
      if (!(await iCloud.isAvailable())) return { kind: 'unavailable' };
      found = await iCloud.download(prepareRestoreIncomingPath(), which);
    } catch {
      return { kind: 'download-failed' };
    }
    if (!found) return { kind: 'none' };
    try {
      const result = restoreFromSnapshot(now.toISOString());
      if (result.kind === 'restored') {
        usersRepo.updateUser(result.db, { icloudBackupLinked: true }, now.toISOString());
      }
      return result;
    } catch (e) {
      // Thrown before the live db was touched (a scratch copy failed): nothing changed.
      return { kind: 'failed', error: e instanceof Error ? e.message : String(e), db: getDb() };
    }
  } finally {
    busy = wasBusy;
  }
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Settings' "Last backed up" time, in the phone's local time (never UTC): `Today at 3:42 PM`,
 *  `Yesterday at 9:05 AM`, or `Oct 12 at 6:30 PM`. */
export function formatBackupTime(at: number, now: Date = new Date()): string {
  const d = new Date(at);
  const hour = d.getHours();
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(d.getMinutes()).padStart(2, '0')} ${
    hour < 12 ? 'AM' : 'PM'
  }`;
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((dayOf(now) - dayOf(d)) / 86_400_000);
  if (daysAgo === 0) return `Today at ${clock}`;
  if (daysAgo === 1) return `Yesterday at ${clock}`;
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()} at ${clock}`;
}
