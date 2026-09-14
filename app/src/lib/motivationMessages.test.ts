import { createRng, seedFromString } from '@roamfit/engine';
import { buildMotivationPool, pickDailyMessages } from './motivationMessages';

const NO_PROGRESS = { hero: null, weekStreak: 0 };

describe('§ daily motivation pool — never guilt, never a fixed single nudge', () => {
  it('has a large always-applicable pool even with zero progress data', () => {
    const pool = buildMotivationPool(NO_PROGRESS);
    expect(pool.length).toBeGreaterThanOrEqual(9);
    for (const m of pool) {
      expect(m.body.toLowerCase()).not.toMatch(/missed|fail|broke|behind|slack/);
    }
  });

  it('adds a level-up message once a hero is close, and a closer-specific one under 2 sessions', () => {
    const far = buildMotivationPool({
      hero: { familyName: 'Horizontal Push', sessionsRemaining: 5 },
      weekStreak: 0,
    });
    const near = buildMotivationPool({
      hero: { familyName: 'Horizontal Push', sessionsRemaining: 1 },
      weekStreak: 0,
    });
    expect(far.some((m) => m.id === 'level-up-1')).toBe(true);
    expect(far.some((m) => m.id === 'level-up-2')).toBe(false);
    expect(near.some((m) => m.id === 'level-up-2')).toBe(true);
  });

  it('adds a streak message only when weekStreak is positive', () => {
    expect(buildMotivationPool(NO_PROGRESS).some((m) => m.id.startsWith('streak'))).toBe(false);
    expect(
      buildMotivationPool({ hero: null, weekStreak: 1 }).some((m) => m.id === 'streak-1'),
    ).toBe(true);
    expect(
      buildMotivationPool({ hero: null, weekStreak: 2 }).some((m) => m.id === 'streak-2'),
    ).toBe(true);
  });
});

describe('pickDailyMessages — deterministic, distinct while the pool allows it', () => {
  it('returns distinct messages when count fits within the pool', () => {
    const pool = buildMotivationPool(NO_PROGRESS);
    const rng = createRng(seedFromString('2026-09-14'));
    const picks = pickDailyMessages(pool, 3, rng);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(3);
  });

  it('is deterministic for the same seed', () => {
    const pool = buildMotivationPool(NO_PROGRESS);
    const a = pickDailyMessages(pool, 3, createRng(seedFromString('2026-09-14')));
    const b = pickDailyMessages(pool, 3, createRng(seedFromString('2026-09-14')));
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it('cycles rather than throwing when count exceeds the pool size', () => {
    const pool = buildMotivationPool({ hero: null, weekStreak: 2 }).slice(0, 2);
    const picks = pickDailyMessages(pool, 5, createRng(1));
    expect(picks).toHaveLength(5);
  });

  it('returns nothing for an empty pool or a zero count', () => {
    expect(pickDailyMessages([], 3, createRng(1))).toEqual([]);
    expect(pickDailyMessages(buildMotivationPool(NO_PROGRESS), 0, createRng(1))).toEqual([]);
  });
});
