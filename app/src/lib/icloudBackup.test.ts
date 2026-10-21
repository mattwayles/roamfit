/**
 * The backup scheduler's guard matrix, against the real on-device store and the Jest fake of the
 * native iCloud module. `createSnapshot` writes a real file the fake knows nothing about, so each
 * test registers whatever it produced with the fake the way the real container would see it.
 */
import { usersRepo } from '@roamfit/store';
import ICloudMock from '../../modules/icloud-backup/src/ICloudBackupModule';
import * as backup from '../db/backup';
import { LIVE_DB_NAME, __resetDbInstanceForTesting, closeDb, getDb } from '../db';
import { deleteDb, scratchNames } from '../db/backupFiles';
import {
  BACKGROUND_THROTTLE_MS,
  __resetBackupSchedulerForTesting,
  checkForExistingBackup,
  downloadAndRestore,
  formatBackupTime,
  getBackupStatus,
  keepThisPhonesData,
  runBackup,
} from './icloudBackup';

const mock = ICloudMock as unknown as {
  __reset(): void;
  __setAvailable(a: boolean): void;
  __setLocalFile(p: string, b: string): void;
  __getLocalFile(p: string): string | undefined;
  __setStored(w: 'latest' | 'previous', b: string | null, at?: number): void;
  __getStored(w: 'latest' | 'previous'): string | null;
  __failNext(fn: 'isAvailable' | 'upload' | 'download' | 'stat', code: string): void;
};

const NOW = new Date('2026-10-20T18:00:00.000Z');
const names = scratchNames(LIVE_DB_NAME);

function onboardedUser() {
  const db = getDb();
  usersRepo.ensureUser(db, NOW.toISOString());
  usersRepo.finishOnboarding(db, NOW.toISOString());
  return db;
}

beforeEach(() => {
  mock.__reset();
  __resetBackupSchedulerForTesting();
  // The snapshot is a real file; hand its path to the fake container as if it were readable.
  const real = backup.createSnapshot;
  jest.spyOn(backup, 'createSnapshot').mockImplementation(() => {
    const path = real();
    mock.__setLocalFile(path, 'snapshot-bytes');
    return path;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  closeDb();
  for (const n of Object.values(names)) deleteDb(n);
  deleteDb(LIVE_DB_NAME);
  __resetDbInstanceForTesting();
});

describe('runBackup guards', () => {
  it('skips when the switch is off', async () => {
    const db = onboardedUser();
    usersRepo.updateUser(db, { icloudBackupEnabled: false }, NOW.toISOString());
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'skipped',
      why: 'disabled',
    });
    expect(mock.__getStored('latest')).toBeNull();
  });

  it('skips until onboarding is finished', async () => {
    const db = getDb();
    usersRepo.ensureUser(db, NOW.toISOString());
    usersRepo.beginOnboarding(db, NOW.toISOString());
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'skipped',
      why: 'onboarding',
    });
    expect(mock.__getStored('latest')).toBeNull();
  });

  it('skips while a restore-or-keep decision is pending', async () => {
    const db = onboardedUser();
    usersRepo.updateUser(db, { backupDecisionPending: true }, NOW.toISOString());
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'skipped',
      why: 'decision-pending',
    });
  });

  it('skips quietly when iCloud is unavailable', async () => {
    const db = onboardedUser();
    mock.__setAvailable(false);
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'skipped',
      why: 'unavailable',
    });
  });

  it('throttles background backups to one per 15 minutes, but not the other reasons', async () => {
    const db = onboardedUser();
    expect((await runBackup(db, { reason: 'background', now: NOW })).kind).toBe('uploaded');
    const soon = new Date(NOW.getTime() + 60_000);
    expect(await runBackup(db, { reason: 'background', now: soon })).toEqual({
      kind: 'skipped',
      why: 'throttled',
    });
    expect((await runBackup(db, { reason: 'session-complete', now: soon })).kind).toBe('uploaded');
    expect((await runBackup(db, { reason: 'manual', now: soon })).kind).toBe('uploaded');
    const later = new Date(NOW.getTime() + BACKGROUND_THROTTLE_MS);
    expect((await runBackup(db, { reason: 'background', now: later })).kind).toBe('uploaded');
  });

  it('allows only one upload at a time', async () => {
    const db = onboardedUser();
    const first = runBackup(db, { reason: 'manual', now: NOW });
    const second = await runBackup(db, { reason: 'manual', now: NOW });
    expect(second).toEqual({ kind: 'skipped', why: 'in-flight' });
    expect((await first).kind).toBe('uploaded');
  });
});

describe('runBackup uploads', () => {
  it('uploads, rotates the previous copy, marks the device linked and cleans up', async () => {
    const db = onboardedUser();
    expect(usersRepo.getUser(db)!.icloudBackupLinked).toBe(false);

    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'uploaded',
      at: NOW.getTime(),
    });
    expect(mock.__getStored('latest')).toBe('snapshot-bytes');
    expect(usersRepo.getUser(db)!.icloudBackupLinked).toBe(true);

    // A second upload (now linked) moves the first to `previous`.
    mock.__setStored('latest', 'older-copy');
    await runBackup(db, { reason: 'manual', now: NOW });
    expect(mock.__getStored('previous')).toBe('older-copy');
    expect(mock.__getStored('latest')).toBe('snapshot-bytes');
  });

  it('never uploads an unreconciled device over an existing backup: it asks for a decision', async () => {
    const db = onboardedUser();
    mock.__setStored('latest', 'other-phones-data');

    expect(await runBackup(db, { reason: 'session-complete', now: NOW })).toEqual({
      kind: 'needs-decision',
    });
    expect(mock.__getStored('latest')).toBe('other-phones-data');
    expect(mock.__getStored('previous')).toBeNull();
    expect(usersRepo.getUser(db)).toMatchObject({
      backupDecisionPending: true,
      icloudBackupLinked: false,
    });
    // And it stays quiet afterwards until the user decides.
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({
      kind: 'skipped',
      why: 'decision-pending',
    });
  });

  it('uploads over an existing backup once the device is linked', async () => {
    const db = onboardedUser();
    mock.__setStored('latest', 'mine');
    keepThisPhonesData(db, NOW);
    expect((await runBackup(db, { reason: 'manual', now: NOW })).kind).toBe('uploaded');
    expect(mock.__getStored('previous')).toBe('mine');
  });

  it('reports a failed upload without throwing, stays unlinked, and recovers next time', async () => {
    const db = onboardedUser();
    mock.__failNext('upload', 'ERR_UPLOAD');
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({ kind: 'failed' });
    expect(usersRepo.getUser(db)!.icloudBackupLinked).toBe(false);
    expect((await runBackup(db, { reason: 'manual', now: NOW })).kind).toBe('uploaded');
  });

  it('turns a throwing availability check into a failed outcome', async () => {
    const db = onboardedUser();
    mock.__failNext('isAvailable', 'ERR_X');
    expect(await runBackup(db, { reason: 'manual', now: NOW })).toEqual({ kind: 'failed' });
  });
});

describe('getBackupStatus', () => {
  it('reports availability and the latest backup time', async () => {
    expect(await getBackupStatus()).toEqual({ available: true, lastBackedUpAt: null });
    mock.__setStored('latest', 'x', 12345);
    expect(await getBackupStatus()).toEqual({ available: true, lastBackedUpAt: 12345 });
    mock.__setAvailable(false);
    expect(await getBackupStatus()).toEqual({ available: false, lastBackedUpAt: null });
  });
});

describe('checkForExistingBackup / keepThisPhonesData', () => {
  it('offers an existing backup to an unreconciled device and holds uploads', async () => {
    const db = onboardedUser();
    expect(await checkForExistingBackup(db, NOW)).toBeNull();
    expect(usersRepo.getUser(db)!.backupDecisionPending).toBe(false);

    mock.__setStored('latest', 'abc', 777);
    expect(await checkForExistingBackup(db, NOW)).toEqual({ modifiedAt: 777, size: 3 });
    expect(usersRepo.getUser(db)!.backupDecisionPending).toBe(true);

    keepThisPhonesData(db, NOW);
    expect(usersRepo.getUser(db)).toMatchObject({
      icloudBackupLinked: true,
      backupDecisionPending: false,
    });
    expect(await checkForExistingBackup(db, NOW)).toBeNull();
  });
});

describe('downloadAndRestore', () => {
  it('reports unavailable, none and a failed download without touching the db', async () => {
    onboardedUser();
    mock.__setAvailable(false);
    expect(await downloadAndRestore()).toEqual({ kind: 'unavailable' });
    mock.__setAvailable(true);
    expect(await downloadAndRestore()).toEqual({ kind: 'none' });
    mock.__setStored('latest', 'x');
    mock.__failNext('download', 'ERR_DOWNLOAD_TIMEOUT');
    expect(await downloadAndRestore()).toEqual({ kind: 'download-failed' });
  });

  it('refuses a download that is not a database, leaving the live db alone', async () => {
    const db = onboardedUser();
    mock.__setStored('latest', 'not a database');
    const result = await downloadAndRestore();
    expect(['invalid', 'failed']).toContain(result.kind);
    expect(usersRepo.getUser(db)).not.toBeNull();
  });
});

describe('formatBackupTime', () => {
  const now = new Date(2026, 9, 20, 15, 0);
  it('uses the local clock for today, yesterday and older days', () => {
    expect(formatBackupTime(new Date(2026, 9, 20, 15, 42).getTime(), now)).toBe('Today at 3:42 PM');
    expect(formatBackupTime(new Date(2026, 9, 19, 0, 5).getTime(), now)).toBe(
      'Yesterday at 12:05 AM',
    );
    expect(formatBackupTime(new Date(2026, 9, 12, 18, 30).getTime(), now)).toBe(
      'Oct 12 at 6:30 PM',
    );
  });
});
