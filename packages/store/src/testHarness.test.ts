import { eq } from 'drizzle-orm';
import { createTestDb } from './testHarness';
import { schema } from './db';
import { runMigrations } from './migrate';
import type { MigrationExecutor } from './migrate';

describe('testHarness / migrations', () => {
  it('applies migrations and round-trips a row through the Drizzle handle', () => {
    const { db, close } = createTestDb();
    try {
      db.insert(schema.users)
        .values({
          id: 'local',
          anchorsAvailable: JSON.stringify(['stance', 'feet']),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
        .run();

      const rows = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].units).toBe('lb'); // default applied
      expect(JSON.parse(rows[0].anchorsAvailable)).toEqual(['stance', 'feet']);
    } finally {
      close();
    }
  });

  it('is idempotent — a second migration run on the same db is a no-op', () => {
    const { db, raw, close } = createTestDb();
    try {
      // Re-running migrations against an already-migrated db must not throw (CREATE TABLE would
      // fail loudly if we tried to re-apply an already-applied file).
      const executor: MigrationExecutor = {
        exec: (sql: string) => raw.exec(sql),
        appliedIds: () =>
          (raw.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id),
        recordApplied: (id: string, appliedAt: string) =>
          raw.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(id, appliedAt),
      };
      expect(() => runMigrations(executor)).not.toThrow();
      void db;
    } finally {
      close();
    }
  });
});
