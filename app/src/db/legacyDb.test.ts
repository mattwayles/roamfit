/**
 * Runs against the real op-sqlite driver and real files (like the other db-backed tests), with
 * unique names per test so concurrent Jest processes cannot collide.
 */
import { open } from '@op-engineering/op-sqlite';
import { migrateLegacyDb } from './legacyDb';

let n = 0;
function names() {
  const tag = `${process.env.JEST_WORKER_ID}-${Date.now()}-${n++}`;
  return { legacy: `legacy-test-${tag}.sqlite`, next: `next-test-${tag}.sqlite` };
}

function seedLegacy(name: string) {
  const db = open({ name });
  db.executeSync('PRAGMA journal_mode = WAL');
  db.executeSync('CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT)');
  db.executeSync("INSERT INTO _migrations VALUES ('0001', 'x'), ('0002', 'y')");
  db.executeSync('CREATE TABLE workouts (id TEXT, note TEXT)');
  db.executeSync("INSERT INTO workouts VALUES ('w1', 'legs')");
  db.close();
}

function tableNames(name: string): string[] {
  const db = open({ name });
  const rows = db.executeSync("SELECT name FROM sqlite_master WHERE type = 'table'").rows as {
    name: string;
  }[];
  db.close();
  return rows.map((r) => r.name);
}

describe('migrateLegacyDb', () => {
  it('copies a populated legacy database to the new name and removes the old one', () => {
    const { legacy, next } = names();
    seedLegacy(legacy);

    migrateLegacyDb(legacy, next);

    const db = open({ name: next });
    expect(db.executeSync('SELECT id, note FROM workouts').rows).toEqual([
      { id: 'w1', note: 'legs' },
    ]);
    expect(db.executeSync('SELECT id FROM _migrations ORDER BY id').rows).toEqual([
      { id: '0001' },
      { id: '0002' },
    ]);
    db.close();
    db.delete();
    expect(tableNames(legacy)).toEqual([]); // reopened name is a fresh empty file
    open({ name: legacy }).delete();
  });

  it('leaves no legacy stub and creates nothing for a fresh install', () => {
    const { legacy, next } = names();

    migrateLegacyDb(legacy, next);

    expect(tableNames(legacy)).toEqual([]);
    open({ name: legacy }).delete();
    open({ name: next }).delete();
  });

  it('is a no-op on the second run', () => {
    const { legacy, next } = names();
    seedLegacy(legacy);
    migrateLegacyDb(legacy, next);
    migrateLegacyDb(legacy, next);

    expect(tableNames(next)).toEqual(expect.arrayContaining(['_migrations', 'workouts']));
    open({ name: next }).delete();
  });

  it('throws and keeps the legacy database when the new one already has content', () => {
    const { legacy, next } = names();
    seedLegacy(legacy);
    const existing = open({ name: next });
    existing.executeSync('CREATE TABLE other (x TEXT)');
    existing.close();

    expect(() => migrateLegacyDb(legacy, next)).toThrow();

    expect(tableNames(legacy)).toEqual(expect.arrayContaining(['_migrations', 'workouts']));
    open({ name: legacy }).delete();
    open({ name: next }).delete();
  });
});
