import { familyLibrary } from '@roamfit/data';
import { BAND_ORDER } from '../types';
import { ALL_ROUNDER_FOCUSES, BADGES, LADDER_FAMILY_COUNT } from './catalog';
import { badgeProgress, evaluateBadges, nextBadges } from './evaluate';
import type { BadgeDefinition, BadgeFacts } from './types';

const NONE: ReadonlySet<string> = new Set();

function emptyFacts(over: Partial<BadgeFacts> = {}): BadgeFacts {
  return {
    sessionsCompleted: 0,
    totalMinutes: 0,
    distinctActiveWeeks: 0,
    focusesTrained: [],
    hardSessionsCompleted: 0,
    cleanSweepSessions: 0,
    longestSessionMinutes: 0,
    earlySessions: 0,
    lateSessions: 0,
    levelUpsTotal: 0,
    highestLevelOrdinal: 0,
    familiesAtTop: [],
    familyCount: LADDER_FAMILY_COUNT,
    familiesAtOrAbove3: 0,
    bestSetPrsTotal: 0,
    maxPrsInOneSession: 0,
    lifetimeReps: 0,
    lifetimeHoldSeconds: 0,
    lifetimeSets: 0,
    heaviestBandOrdinal: -1,
    distinctExercisesPerformed: 0,
    passportEnabled: false,
    citiesVisited: 0,
    countriesVisited: 0,
    comebacks: 0,
    recoveryWeeksCompleted: 0,
    ...over,
  };
}

/** Facts that sit exactly at the threshold of one badge, by series. */
const AT_THRESHOLD: Record<string, (target: number, def: BadgeDefinition) => Partial<BadgeFacts>> =
  {
    sessions: (t) => ({ sessionsCompleted: t }),
    minutes: (t) => ({ totalMinutes: t }),
    active_weeks: (t) => ({ distinctActiveWeeks: t }),
    all_rounder: () => ({ focusesTrained: [...ALL_ROUNDER_FOCUSES] }),
    early_bird: (t) => ({ earlySessions: t }),
    night_owl: (t) => ({ lateSessions: t }),
    comeback: (t) => ({ comebacks: t }),
    recovery_week: (t) => ({ recoveryWeeksCompleted: t }),
    level_ups: (t) => ({ levelUpsTotal: t }),
    high_rung: (t) => ({ highestLevelOrdinal: t }),
    summit: (t) => ({ familiesAtTop: Array.from({ length: t }, (_, i) => `f${i}`) }),
    well_rounded: (t) => ({ familiesAtOrAbove3: t }),
    heavy_band: (t) => ({ heaviestBandOrdinal: t - 1 }),
    best_sets: (t) => ({ bestSetPrsTotal: t }),
    record_day: (t) => ({ maxPrsInOneSession: t }),
    hard_sessions: (t) => ({ hardSessionsCompleted: t }),
    clean_sweep: (t) => ({ cleanSweepSessions: t }),
    reps: (t) => ({ lifetimeReps: t }),
    hold_time: (t) => ({ lifetimeHoldSeconds: t }),
    long_haul: (t) => ({ longestSessionMinutes: t }),
    exercises_tried: (t) => ({ distinctExercisesPerformed: t }),
    cities: (t) => ({ citiesVisited: t, passportEnabled: true }),
    countries: (t) => ({ countriesVisited: t, passportEnabled: true }),
  };

describe('badge catalog', () => {
  it('has unique, well-formed ids', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z_]+_[a-z0-9]+$/);
  });

  it('every non-hidden live badge has a positive how-to hint, and hidden ones have none', () => {
    for (const b of BADGES.filter((x) => !x.retired)) {
      if (b.hidden) {
        expect(b.hint).toBeUndefined();
      } else {
        expect(b.hint && b.hint.length > 10).toBe(true);
        // Never a deficit: no "need", "left", "remaining", "more" counting.
        expect(b.hint).not.toMatch(/\b(need|left|remaining|missing|behind|only)\b/i);
      }
    }
  });

  it('ids are <series>_<suffix> and every series is known to the test', () => {
    for (const b of BADGES) {
      expect(b.id.startsWith(`${b.series}_`)).toBe(true);
      expect(AT_THRESHOLD[b.series]).toBeDefined();
    }
  });

  it('every series has strictly increasing thresholds and one category', () => {
    const bySeries = new Map<string, BadgeDefinition[]>();
    for (const b of BADGES) bySeries.set(b.series, [...(bySeries.get(b.series) ?? []), b]);
    for (const [name, defs] of bySeries) {
      for (let i = 1; i < defs.length; i += 1) {
        expect(defs[i].target).toBeGreaterThan(defs[i - 1].target);
      }
      expect(new Set(defs.map((d) => d.category)).size).toBe(1);
      expect(defs[defs.length - 1].tier).toBe(defs.length === 1 ? 'gold' : 'summit');
      if (defs.length > 1) expect(defs.slice(0, -1).every((d) => d.tier !== 'summit')).toBe(true);
      expect(name).toBeTruthy();
    }
  });

  it('every badge has a name, copy and icon, with no guilt language', () => {
    for (const b of BADGES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(`${b.name} ${b.description}`).not.toMatch(
        /streak|missed|miss |lost|gap|days? off|consecutive/i,
      );
    }
  });

  it('ladder count matches the family library', () => {
    expect(LADDER_FAMILY_COUNT).toBe(familyLibrary.families.length);
  });

  it('heavy_band targets line up with BAND_ORDER', () => {
    const t = (id: string): number => BADGES.find((b) => b.id === id)!.target;
    expect(BAND_ORDER[t('heavy_band_b3') - 1]).toBe('B3');
    expect(BAND_ORDER[t('heavy_band_b4') - 1]).toBe('B4');
    expect(BAND_ORDER[t('heavy_band_b5') - 1]).toBe('B5');
    expect(BAND_ORDER[t('heavy_band_stacked') - 1]).toBe('B5+B1');
  });

  // Renaming an id orphans every earned row, so this fails loudly (same protection as level ids).
  // Adding a badge: append to this list. Removing one: mark it `retired` instead.
  it('id list snapshot', () => {
    expect(BADGES.map((b) => b.id)).toMatchInlineSnapshot(`
      [
        "sessions_1",
        "sessions_5",
        "sessions_10",
        "sessions_25",
        "sessions_50",
        "sessions_100",
        "sessions_250",
        "sessions_500",
        "minutes_60",
        "minutes_300",
        "minutes_1000",
        "minutes_3000",
        "minutes_6000",
        "active_weeks_4",
        "active_weeks_12",
        "active_weeks_26",
        "active_weeks_52",
        "active_weeks_104",
        "all_rounder_4",
        "early_bird_1",
        "night_owl_1",
        "comeback_1",
        "comeback_3",
        "recovery_week_1",
        "level_ups_1",
        "level_ups_5",
        "level_ups_10",
        "level_ups_25",
        "level_ups_50",
        "high_rung_4",
        "high_rung_7",
        "high_rung_10",
        "high_rung_12",
        "summit_1",
        "summit_3",
        "summit_all",
        "well_rounded_all",
        "heavy_band_b3",
        "heavy_band_b4",
        "heavy_band_b5",
        "heavy_band_stacked",
        "best_sets_1",
        "best_sets_10",
        "best_sets_25",
        "best_sets_50",
        "best_sets_100",
        "record_day_3",
        "hard_sessions_1",
        "hard_sessions_10",
        "hard_sessions_25",
        "hard_sessions_50",
        "clean_sweep_1",
        "clean_sweep_10",
        "clean_sweep_25",
        "reps_1000",
        "reps_5000",
        "reps_10000",
        "reps_25000",
        "reps_50000",
        "hold_time_600",
        "hold_time_3600",
        "hold_time_10800",
        "long_haul_45",
        "long_haul_60",
        "exercises_tried_10",
        "exercises_tried_25",
        "exercises_tried_50",
        "exercises_tried_100",
        "cities_3",
        "cities_10",
        "cities_25",
        "countries_2",
        "countries_5",
      ]
    `);
  });
});

describe('evaluateBadges', () => {
  it('an empty-facts user earns nothing', () => {
    expect(evaluateBadges(emptyFacts(), NONE)).toEqual([]);
  });

  it('crossing each threshold earns that tier, and the ones below it in its series', () => {
    for (const def of BADGES) {
      const facts = emptyFacts(AT_THRESHOLD[def.series](def.target, def));
      const earned = evaluateBadges(facts, NONE).map((b) => b.id);
      expect(earned).toContain(def.id);
      const below = BADGES.filter((b) => b.series === def.series && b.target > def.target);
      for (const b of below) expect(earned).not.toContain(b.id);
    }
  });

  it('one short of a threshold earns nothing from that badge', () => {
    for (const def of BADGES) {
      if (def.series === 'all_rounder' || def.target <= 1 || def.series === 'heavy_band') continue;
      const facts = emptyFacts(AT_THRESHOLD[def.series](def.target - 1, def));
      expect(evaluateBadges(facts, NONE).map((b) => b.id)).not.toContain(def.id);
    }
  });

  it('never returns already-earned badges, and is idempotent', () => {
    const facts = emptyFacts({ sessionsCompleted: 10, totalMinutes: 400 });
    const first = evaluateBadges(facts, NONE);
    expect(first.map((b) => b.id)).toEqual([
      'sessions_1',
      'sessions_5',
      'sessions_10',
      'minutes_60',
      'minutes_300',
    ]);
    const second = evaluateBadges(facts, new Set(first.map((b) => b.id)));
    expect(second).toEqual([]);
    expect(evaluateBadges(facts, new Set(['sessions_1'])).map((b) => b.id)).not.toContain(
      'sessions_1',
    );
  });

  it('orders by category then tier', () => {
    const facts = emptyFacts({
      sessionsCompleted: 5,
      levelUpsTotal: 1,
      bestSetPrsTotal: 1,
      distinctExercisesPerformed: 10,
    });
    expect(evaluateBadges(facts, NONE).map((b) => b.id)).toEqual([
      'sessions_1',
      'sessions_5',
      'level_ups_1',
      'best_sets_1',
      'exercises_tried_10',
    ]);
  });

  it('never awards a retired badge', () => {
    const retired = BADGES.find((b) => b.id === 'sessions_1')!;
    const mutable = retired as { retired?: boolean };
    mutable.retired = true;
    try {
      expect(evaluateBadges(emptyFacts({ sessionsCompleted: 1 }), NONE)).toEqual([]);
    } finally {
      delete mutable.retired;
    }
  });

  it('passport badges need Passport on', () => {
    const off = emptyFacts({ citiesVisited: 30, countriesVisited: 9, passportEnabled: false });
    expect(evaluateBadges(off, NONE)).toEqual([]);
    const on = { ...off, passportEnabled: true };
    expect(evaluateBadges(on, NONE).map((b) => b.id)).toEqual([
      'cities_3',
      'countries_2',
      'cities_10',
      'cities_25',
      'countries_5',
    ]);
  });

  it('all_rounder needs every focus; cardio does not count toward it', () => {
    const three = emptyFacts({ focusesTrained: ['upper', 'abs', 'legs', 'cardio'] });
    expect(evaluateBadges(three, NONE)).toEqual([]);
    expect(
      evaluateBadges(emptyFacts({ focusesTrained: ['upper', 'abs', 'legs', 'full'] }), NONE).map(
        (b) => b.id,
      ),
    ).toEqual(['all_rounder_4']);
  });
});

describe('badgeProgress', () => {
  it('reports current/target/fraction and caps at the target', () => {
    const def = BADGES.find((b) => b.id === 'sessions_25')!;
    expect(badgeProgress(emptyFacts({ sessionsCompleted: 12 }), def)).toEqual({
      current: 12,
      target: 25,
      fraction: 12 / 25,
    });
    expect(badgeProgress(emptyFacts({ sessionsCompleted: 99 }), def)).toEqual({
      current: 25,
      target: 25,
      fraction: 1,
    });
  });

  it('never goes negative (no band yet)', () => {
    const def = BADGES.find((b) => b.id === 'heavy_band_b3')!;
    expect(badgeProgress(emptyFacts(), def).current).toBe(0);
  });
});

describe('nextBadges', () => {
  it('returns the closest unearned badges, ties in catalog order', () => {
    const facts = emptyFacts({ sessionsCompleted: 4, totalMinutes: 30, levelUpsTotal: 0 });
    const ids = nextBadges(facts, NONE, 3).map((b) => b.id);
    // sessions_5 is 4/5, the closest
    expect(nextBadges(emptyFacts({ sessionsCompleted: 4 }), new Set(['sessions_1']), 1)[0].id).toBe(
      'sessions_5',
    );
    // sessions_1 is earned (4 >= 1) so it is excluded even if not in earnedIds
    expect(ids).not.toContain('sessions_1');
  });

  it('skips hidden, retired, earned and (with Passport off) passport badges', () => {
    const facts = emptyFacts({ citiesVisited: 2, earlySessions: 0 });
    const ids = nextBadges(facts, NONE, 100).map((b) => b.id);
    expect(ids).not.toContain('early_bird_1');
    expect(ids).not.toContain('record_day_3');
    expect(ids).not.toContain('cities_3');
    const withPassport = nextBadges({ ...facts, passportEnabled: true }, NONE, 100).map(
      (b) => b.id,
    );
    expect(withPassport[0]).toBe('cities_3');
  });

  it('breaks ties by catalog order and respects n', () => {
    const ids = nextBadges(emptyFacts(), NONE, 3).map((b) => b.id);
    expect(ids).toEqual(['sessions_1', 'sessions_5', 'sessions_10']);
    expect(nextBadges(emptyFacts(), NONE, 0)).toEqual([]);
  });
});
