/**
 * Runs against the real op-sqlite driver and real files (like `legacyDb.test.ts`). The live db is
 * the per-test-file `getDb()` file, so everything here is isolated per Jest process/file.
 */
import { open } from '@op-engineering/op-sqlite';
import { knownMigrationIds, queuesRepo, usersRepo } from '@roamfit/store';
import { LIVE_DB_NAME, __resetDbInstanceForTesting, closeDb, getDb } from './index';
import {
  RESTORE_INCOMING_NAME,
  cleanupScratchFiles,
  createSnapshot,
  inspectSnapshot,
  prepareRestoreIncomingPath,
  restoreFromSnapshot,
} from './backup';
import { copyVerified, deleteDb, readAppliedIds, scratchNames } from './backupFiles';

const names = scratchNames(LIVE_DB_NAME);
const NOW = '2026-10-20T10:00:00.000Z';

/** Moves the latest snapshot into the incoming slot, the way the native `download` would. */
function stageSnapshotAsIncoming(): void {
  const src = open({ name: names.outgoing });
  copyVerified(src, RESTORE_INCOMING_NAME, readAppliedIds(names.outgoing)!);
  src.close();
}

function setup(note: 'a' | 'b') {
  const db = getDb();
  usersRepo.ensureUser(db, NOW);
  usersRepo.updateUser(db, { units: note === 'a' ? 'kg' : 'lb' }, NOW);
  return db;
}

afterEach(() => {
  closeDb();
  for (const n of Object.values(names)) deleteDb(n);
  deleteDb(LIVE_DB_NAME);
  __resetDbInstanceForTesting();
});

describe('createSnapshot', () => {
  it('writes a consistent copy that round-trips live data and migration ids', () => {
    const db = setup('a');
    queuesRepo.enqueueDeferredWork(db, 'healthkit_write', 's1', {}, NOW);

    const path = createSnapshot();

    expect(path).toContain(names.outgoing);
    expect(readAppliedIds(names.outgoing)).toEqual([...knownMigrationIds()].sort());
    const copy = open({ name: names.outgoing });
    expect(copy.executeSync('SELECT units FROM users').rows).toEqual([{ units: 'kg' }]);
    expect(copy.executeSync('SELECT kind FROM deferred_work').rows).toEqual([
      { kind: 'healthkit_write' },
    ]);
    copy.close();
  });

  it('replaces a stale snapshot rather than failing on a non-empty target', () => {
    setup('a');
    createSnapshot();
    usersRepo.updateUser(getDb(), { units: 'lb' }, NOW);
    createSnapshot();
    const copy = open({ name: names.outgoing });
    expect(copy.executeSync('SELECT units FROM users').rows).toEqual([{ units: 'lb' }]);
    copy.close();
  });
});

describe('inspectSnapshot', () => {
  it('is ok for a snapshot of this build', () => {
    setup('a');
    createSnapshot();
    expect(inspectSnapshot(names.outgoing)).toEqual({
      kind: 'ok',
      appliedIds: [...knownMigrationIds()].sort(),
    });
  });

  it('is newer, naming the unknown ids, when the backup has migrations this build lacks', () => {
    setup('a');
    createSnapshot();
    const c = open({ name: names.outgoing });
    c.executeSync("INSERT INTO _migrations (id, applied_at) VALUES ('9999_future.sql', 'x')");
    c.close();
    expect(inspectSnapshot(names.outgoing)).toEqual({
      kind: 'newer',
      unknownIds: ['9999_future.sql'],
    });
  });

  it('is invalid for a missing file and for a database without _migrations', () => {
    expect(inspectSnapshot(names.incoming)).toEqual({ kind: 'invalid' });
    const c = open({ name: names.incoming });
    c.executeSync('CREATE TABLE other (x TEXT)');
    c.close();
    expect(inspectSnapshot(names.incoming)).toEqual({ kind: 'invalid' });
  });
});

describe('restoreFromSnapshot', () => {
  it('replaces live data with the backup, clears healthkit_write work and the pending flag', () => {
    const db = setup('a');
    usersRepo.updateUser(db, { backupDecisionPending: true }, NOW);
    createSnapshot();
    stageSnapshotAsIncoming();
    // Diverge live after the snapshot, with work the restore must drop.
    usersRepo.updateUser(db, { units: 'lb' }, NOW);
    queuesRepo.enqueueDeferredWork(db, 'healthkit_write', 's1', {}, NOW);
    queuesRepo.enqueueDeferredWork(db, 'passport_geocode', 's1', {}, NOW);

    const result = restoreFromSnapshot(NOW);

    expect(result.kind).toBe('restored');
    const restored = getDb();
    const user = usersRepo.getUser(restored)!;
    expect(user.units).toBe('kg');
    expect(user.backupDecisionPending).toBe(false);
    // The snapshot predates the enqueues, so nothing is queued at all.
    expect(queuesRepo.getPendingDeferredWork(restored)).toEqual([]);
    for (const n of [names.incoming, names.staging, names.previous]) {
      expect(readAppliedIds(n)).toBeNull();
      deleteDb(n);
    }
  });

  it('deletes healthkit_write jobs that were inside the backup but keeps other kinds', () => {
    const db = setup('a');
    queuesRepo.enqueueDeferredWork(db, 'healthkit_write', 's1', {}, NOW);
    queuesRepo.enqueueDeferredWork(db, 'passport_geocode', 's1', {}, NOW);
    createSnapshot();
    stageSnapshotAsIncoming();

    expect(restoreFromSnapshot(NOW).kind).toBe('restored');

    expect(queuesRepo.getPendingDeferredWork(getDb()).map((j) => j.kind)).toEqual([
      'passport_geocode',
    ]);
  });

  it('migrates an older backup forward', () => {
    setup('a');
    createSnapshot();
    // Make the snapshot look like it came from the build before migration 0039.
    const old = open({ name: names.outgoing });
    old.executeSync('ALTER TABLE users DROP COLUMN icloud_backup_enabled');
    old.executeSync('ALTER TABLE users DROP COLUMN backup_decision_pending');
    old.executeSync("DELETE FROM _migrations WHERE id = '0039_icloud_backup.sql'");
    old.close();
    stageSnapshotAsIncoming();

    const result = restoreFromSnapshot(NOW);

    expect(result.kind).toBe('restored');
    const user = usersRepo.getUser(getDb())!;
    expect(user.units).toBe('kg');
    expect(user.icloudBackupEnabled).toBe(true);
    expect(readAppliedIds(LIVE_DB_NAME)).toContain('0039_icloud_backup.sql');
  });

  it('refuses a newer backup and leaves the live db untouched', () => {
    const db = setup('a');
    createSnapshot();
    const c = open({ name: names.outgoing });
    c.executeSync("INSERT INTO _migrations (id, applied_at) VALUES ('9999_future.sql', 'x')");
    c.close();
    stageSnapshotAsIncoming();
    usersRepo.updateUser(db, { units: 'lb' }, NOW);

    const result = restoreFromSnapshot(NOW);

    expect(result).toEqual({ kind: 'newer', unknownIds: ['9999_future.sql'] });
    expect(getDb()).toBe(db); // never closed
    expect(usersRepo.getUser(db)!.units).toBe('lb');
    expect(readAppliedIds(names.previous)).toBeNull();
  });

  it('refuses an invalid download and discards it', () => {
    const db = setup('a');
    const c = open({ name: RESTORE_INCOMING_NAME });
    c.executeSync('CREATE TABLE junk (x TEXT)');
    c.close();

    expect(restoreFromSnapshot(NOW)).toEqual({ kind: 'invalid' });
    expect(getDb()).toBe(db);
    expect(readAppliedIds(names.incoming)).toBeNull();
  });
});

describe('recovery of an interrupted restore', () => {
  it('rebuilds a missing live db from the pre-swap copy on the next getDb()', () => {
    setup('a');
    // Simulate a crash in step 4: previous verified, staging made, live deleted.
    const live = open({ name: LIVE_DB_NAME });
    copyVerified(live, names.previous, readAppliedIds(LIVE_DB_NAME)!);
    live.close();
    closeDb();
    deleteDb(LIVE_DB_NAME);

    const db = getDb();

    expect(usersRepo.getUser(db)!.units).toBe('kg');
    expect(readAppliedIds(names.previous)).toBeNull();
  });

  it('keeps a healthy live db and just clears the scratch files', () => {
    setup('a');
    const live = open({ name: LIVE_DB_NAME });
    copyVerified(live, names.previous, readAppliedIds(LIVE_DB_NAME)!);
    live.close();
    closeDb();

    expect(usersRepo.getUser(getDb())!.units).toBe('kg');
    expect(readAppliedIds(names.previous)).toBeNull();
  });
});

describe('cleanupScratchFiles / prepareRestoreIncomingPath', () => {
  it('removes a stale snapshot and a stale download', () => {
    setup('a');
    createSnapshot();
    stageSnapshotAsIncoming();

    cleanupScratchFiles();

    expect(readAppliedIds(names.outgoing)).toBeNull();
    expect(readAppliedIds(names.incoming)).toBeNull();
  });

  it('hands back an absolute path to an empty incoming slot', () => {
    setup('a');
    createSnapshot();
    stageSnapshotAsIncoming();

    const path = prepareRestoreIncomingPath();

    expect(path).toContain(RESTORE_INCOMING_NAME);
    expect(readAppliedIds(names.incoming)).toBeNull();
  });
});
