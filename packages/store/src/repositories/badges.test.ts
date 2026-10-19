import { createTestDb } from '../testHarness';
import {
  countUnseen,
  getEarnedBadgeIds,
  getEarnedBadges,
  insertEarnedBadges,
  markBadgesSeen,
} from './badges';

describe('earned badges repository (Track 38)', () => {
  it('inserts once per badge id and never twice', () => {
    const { db } = createTestDb();
    const first = insertEarnedBadges(
      db,
      [{ badgeId: 'sessions_1', localDate: '2026-03-01', sessionId: 's1', retroactive: false }],
      '2026-03-01T10:00:00.000Z',
    );
    const again = insertEarnedBadges(
      db,
      [
        { badgeId: 'sessions_1', localDate: '2026-03-02', sessionId: 's2', retroactive: false },
        { badgeId: 'sessions_5', localDate: '2026-03-02', sessionId: 's2', retroactive: true },
      ],
      '2026-03-02T10:00:00.000Z',
    );
    expect(first).toEqual(['sessions_1']);
    expect(again).toEqual(['sessions_5']);
    const rows = getEarnedBadges(db);
    expect(rows.map((r) => r.badgeId)).toEqual(['sessions_5', 'sessions_1']);
    // The original award is untouched by the second attempt.
    expect(rows[1]).toMatchObject({ sessionId: 's1', localDate: '2026-03-01', retroactive: false });
    expect(getEarnedBadgeIds(db)).toEqual(new Set(['sessions_1', 'sessions_5']));
  });

  it('tracks seen state and keeps the first look', () => {
    const { db } = createTestDb();
    insertEarnedBadges(
      db,
      [
        { badgeId: 'a_1', localDate: '2026-03-01', sessionId: null, retroactive: true },
        { badgeId: 'b_1', localDate: '2026-03-01', sessionId: null, retroactive: true },
      ],
      '2026-03-01T10:00:00.000Z',
    );
    expect(countUnseen(db)).toBe(2);
    markBadgesSeen(db, ['a_1'], '2026-03-02T00:00:00.000Z');
    markBadgesSeen(db, ['a_1'], '2026-03-09T00:00:00.000Z');
    markBadgesSeen(db, [], '2026-03-09T00:00:00.000Z');
    expect(countUnseen(db)).toBe(1);
    expect(getEarnedBadges(db).find((r) => r.badgeId === 'a_1')!.seenAt).toBe(
      '2026-03-02T00:00:00.000Z',
    );
  });

  it('stores a payload excerpt', () => {
    const { db } = createTestDb();
    insertEarnedBadges(
      db,
      [
        {
          badgeId: 'reps_1000',
          localDate: '2026-03-01',
          sessionId: 's',
          retroactive: false,
          payload: { value: 1012 },
        },
      ],
      '2026-03-01T10:00:00.000Z',
    );
    expect(getEarnedBadges(db)[0].payload).toEqual({ value: 1012 });
  });
});
