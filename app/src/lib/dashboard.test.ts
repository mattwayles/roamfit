/**
 * Pure-function tests for §14.1 dashboard composition — no db, no RN rendering. See
 * `dashboard.ts`'s header for why this logic lives outside `HomeScreen.tsx`.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { calibrationStartLevel, defaultMicroForExercise } from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import type { ProgressionFamilyId } from '@roamfit/data';
import {
  buildCalendarDays,
  buildLifetimeCounters,
  buildMuscleBalanceRows,
  buildPassportSummary,
  buildProgressionBoard,
  nextUnlockHero,
  overWorkedMuscles,
} from './dashboard';
import type { sessionsRepo } from '@roamfit/store';

type DashboardSessionSummary = sessionsRepo.DashboardSessionSummary;

function seedAllFamilies(): Record<ProgressionFamilyId, ProgressionState> {
  const out = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of familyLibrary.families) {
    const start = calibrationStartLevel(family);
    const exercise = exerciseLibrary.exercises.find((e) => e.id === start.anchor_exercise_id)!;
    out[family.id] = {
      familyId: family.id,
      levelId: start.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: true,
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return out;
}

describe('§14.2 zero-session dashboard — buildProgressionBoard at starting levels', () => {
  it('shows every family at its calibration start level, none mastered, all with a next unlock', () => {
    const states = seedAllFamilies();
    const board = buildProgressionBoard(exerciseLibrary, familyLibrary, states);

    expect(board.length).toBe(familyLibrary.families.length);
    for (const entry of board) {
      expect(entry.isMastery).toBe(false);
      expect(entry.ordinal.n).toBeGreaterThan(0);
      expect(entry.ordinal.n).toBeLessThanOrEqual(entry.ordinal.of);
      expect(entry.exerciseName.length).toBeGreaterThan(0);
      expect(entry.sessionsToNextLevel).not.toBeNull();
      expect(entry.sessionsToNextLevel as number).toBeGreaterThan(0);
    }
  });

  it('a family with no progression_state row is simply omitted, not shown with fabricated data', () => {
    const states = seedAllFamilies();
    const partial = { ...states };
    delete partial['horizontal_push' as ProgressionFamilyId];
    const board = buildProgressionBoard(exerciseLibrary, familyLibrary, partial);
    expect(board.some((e) => e.familyId === 'horizontal_push')).toBe(false);
    expect(board.length).toBe(familyLibrary.families.length - 1);
  });
});

describe('§6.4/§14.1.3 nextUnlockHero', () => {
  it('picks the family with the fewest sessions remaining, not the first in the list', () => {
    const states = seedAllFamilies();
    const board = buildProgressionBoard(exerciseLibrary, familyLibrary, states);
    const hero = nextUnlockHero(board);
    expect(hero).not.toBeNull();
    const min = Math.min(...board.map((e) => e.sessionsToNextLevel as number));
    expect(hero!.sessionsRemaining).toBe(min);
  });

  it('returns null only when every family is at Mastery', () => {
    const states = seedAllFamilies();
    // Push every family to its own max level.
    for (const family of familyLibrary.families) {
      const maxLevel = family.levels[family.levels.length - 1];
      const exercise = exerciseLibrary.exercises.find((e) => e.id === maxLevel.anchor_exercise_id)!;
      states[family.id] = {
        familyId: family.id,
        levelId: maxLevel.level_id,
        micro: defaultMicroForExercise(exercise),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      };
    }
    const board = buildProgressionBoard(exerciseLibrary, familyLibrary, states);
    expect(board.every((e) => e.isMastery)).toBe(true);
    expect(nextUnlockHero(board)).toBeNull();
  });
});

describe('§14.1.7 muscle balance', () => {
  it('flags a muscle whose volume exceeds 1.5x the trailing mean, and only that one', () => {
    const rows = { hamstrings: 10, quads: 2, chest: 2, back: 2 };
    const flagged = overWorkedMuscles(rows);
    expect(flagged.has('hamstrings')).toBe(true);
    expect(flagged.has('quads')).toBe(false);
  });

  it('an even, balanced spread flags nothing', () => {
    const rows = { hamstrings: 4, quads: 4, chest: 4, back: 4 };
    expect(overWorkedMuscles(rows).size).toBe(0);
  });

  it('buildMuscleBalanceRows sorts by volume descending and carries the flag through', () => {
    const rows = buildMuscleBalanceRows({ hamstrings: 10, quads: 2, chest: 6 });
    expect(rows.map((r) => r.muscle)).toEqual(['hamstrings', 'chest', 'quads']);
    expect(rows.find((r) => r.muscle === 'hamstrings')!.overWorked).toBe(true);
  });

  it('an empty ledger (zero sessions) produces an empty row list, not an error', () => {
    expect(buildMuscleBalanceRows({})).toEqual([]);
  });
});

function summary(
  localDate: string,
  opts: Partial<DashboardSessionSummary> = {},
): DashboardSessionSummary {
  return {
    localDate,
    actualMinutes: 30,
    estimatedMinutes: 30,
    focus: 'full',
    city: null,
    country: null,
    ...opts,
  };
}

describe('§9.6 Passport — strings only, deduplicated, accumulating', () => {
  it('counts distinct cities/countries and sessions abroad, ignoring unresolved pins', () => {
    const passport = buildPassportSummary([
      summary('2026-05-01', { city: 'Lisbon', country: 'Portugal' }),
      summary('2026-05-08', { city: 'Lisbon', country: 'Portugal' }), // same city again
      summary('2026-05-15', { city: 'Porto', country: 'Portugal' }),
      summary('2026-05-22'), // no pin yet (offline completion still queued)
    ]);
    expect(passport.cities.sort()).toEqual(['Lisbon', 'Porto']);
    expect(passport.countries).toEqual(['Portugal']);
    expect(passport.sessionsAbroad).toBe(3);
  });

  it('an empty session list is an empty (not error) passport — v1 cold start', () => {
    const passport = buildPassportSummary([]);
    expect(passport.cities).toEqual([]);
    expect(passport.countries).toEqual([]);
    expect(passport.sessionsAbroad).toBe(0);
  });
});

describe('§14.1.6 calendar heatmap — untrained days are present and neutral, never omitted', () => {
  it('produces one entry per day in the trailing window, with null minutes on untrained days', () => {
    const days = buildCalendarDays(
      [summary('2026-05-03', { actualMinutes: 42 })],
      '2026-05-05',
      5,
      new Set(),
    );
    expect(days.length).toBe(5);
    expect(days.map((d) => d.localDate)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
    ]);
    expect(days.find((d) => d.localDate === '2026-05-03')!.minutes).toBe(42);
    expect(days.find((d) => d.localDate === '2026-05-01')!.minutes).toBeNull();
  });

  it('marks each trained day with its session focus, and untrained days with a null focus', () => {
    const days = buildCalendarDays(
      [summary('2026-05-03', { focus: 'upper' })],
      '2026-05-05',
      5,
      new Set(),
    );
    expect(days.find((d) => d.localDate === '2026-05-03')!.focus).toBe('upper');
    expect(days.find((d) => d.localDate === '2026-05-03')!.marker).toBe('upper');
    expect(days.find((d) => d.localDate === '2026-05-01')!.focus).toBeNull();
    expect(days.find((d) => d.localDate === '2026-05-01')!.marker).toBe('none');
  });

  it('attributes the day to whichever of two same-day sessions took more minutes', () => {
    const days = buildCalendarDays(
      [
        summary('2026-05-05', { focus: 'legs', actualMinutes: 10 }),
        summary('2026-05-05', { focus: 'abs', actualMinutes: 25 }),
      ],
      '2026-05-05',
      1,
      new Set(),
    );
    expect(days[0].minutes).toBe(35);
    expect(days[0].focus).toBe('abs');
  });

  it('a manual marker overrides the derived focus/travel state, and is reported back on the day', () => {
    const days = buildCalendarDays(
      [summary('2026-05-03', { focus: 'upper' })],
      '2026-05-05',
      5,
      new Set(['2026-05-01']),
      new Map([
        ['2026-05-03', 'legs'],
        ['2026-05-02', 'none'],
        ['2026-05-01', 'full'],
      ]),
    );
    // Overrides a trained day's own focus.
    const overridden = days.find((d) => d.localDate === '2026-05-03')!;
    expect(overridden.focus).toBe('upper');
    expect(overridden.manualMarker).toBe('legs');
    expect(overridden.marker).toBe('legs');
    // Overrides an otherwise-empty day.
    const filledIn = days.find((d) => d.localDate === '2026-05-02')!;
    expect(filledIn.marker).toBe('none');
    expect(filledIn.manualMarker).toBe('none');
    // Overrides a travel day.
    const untravelled = days.find((d) => d.localDate === '2026-05-01')!;
    expect(untravelled.inTransit).toBe(true);
    expect(untravelled.marker).toBe('full');
    // A day with no manual entry falls back to the derived state.
    expect(days.find((d) => d.localDate === '2026-05-04')!.manualMarker).toBeNull();
  });

  it('falls back to estimatedMinutes when actualMinutes is null (an abandoned-but-logged edge case)', () => {
    const days = buildCalendarDays(
      [summary('2026-05-05', { actualMinutes: null, estimatedMinutes: 20 })],
      '2026-05-05',
      1,
      new Set(),
    );
    expect(days[0].minutes).toBe(20);
  });

  it('marks an untrained day in transit, but never overrides a trained day', () => {
    const days = buildCalendarDays(
      [summary('2026-05-04', { actualMinutes: 30 })],
      '2026-05-05',
      2,
      new Set(['2026-05-04', '2026-05-05']),
    );
    // 2026-05-04 was travelled AND trained — the workout is the more informative fact.
    expect(days.find((d) => d.localDate === '2026-05-04')).toEqual({
      localDate: '2026-05-04',
      minutes: 30,
      inTransit: true,
      focus: 'full',
      manualMarker: null,
      marker: 'full',
    });
    // 2026-05-05 was travelled and untrained — this is the case the marker exists for.
    expect(days.find((d) => d.localDate === '2026-05-05')).toEqual({
      localDate: '2026-05-05',
      minutes: null,
      inTransit: true,
      focus: null,
      manualMarker: null,
      marker: 'travel',
    });
  });
});

describe('§14.1.8 lifetime counters — monotonic, permanent', () => {
  it('assembles every counter from already-fetched inputs with no re-derivation', () => {
    const passport = buildPassportSummary([
      summary('2026-05-01', { city: 'Lisbon', country: 'Portugal' }),
    ]);
    const counters = buildLifetimeCounters(12, 359.6, passport, 4, 7);
    expect(counters).toEqual({
      sessions: 12,
      totalMinutes: 360,
      cities: 1,
      countries: 1,
      levelsGained: 4,
      bestSets: 7,
    });
  });
});
