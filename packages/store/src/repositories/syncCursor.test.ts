import { createTestDb } from '../testHarness';
import { getSyncCursor, setSyncCursor } from './syncCursor';

describe('syncCursor', () => {
  it('an unset cursor reads as null', () => {
    const { db } = createTestDb();
    expect(getSyncCursor(db, 'video_config_pulled_at')).toBeNull();
  });

  it('round-trips a value', () => {
    const { db } = createTestDb();
    setSyncCursor(db, 'video_config_pulled_at', '2026-08-01T00:00:00.000Z');
    expect(getSyncCursor(db, 'video_config_pulled_at')).toBe('2026-08-01T00:00:00.000Z');
  });

  it('a second set overwrites rather than duplicating', () => {
    const { db } = createTestDb();
    setSyncCursor(db, 'k', 'v1');
    setSyncCursor(db, 'k', 'v2');
    expect(getSyncCursor(db, 'k')).toBe('v2');
  });

  it('different cursor names are independent', () => {
    const { db } = createTestDb();
    setSyncCursor(db, 'a', '1');
    setSyncCursor(db, 'b', '2');
    expect(getSyncCursor(db, 'a')).toBe('1');
    expect(getSyncCursor(db, 'b')).toBe('2');
  });
});
