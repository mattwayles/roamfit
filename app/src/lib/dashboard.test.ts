/**
 * Pure-function tests for §14.1 dashboard composition — no db, no RN rendering. See
 * `dashboard.ts`'s header for why this logic lives outside `HomeScreen.tsx`.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { calibrationStartLevel, defaultMicroForExercise } from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import type { ProgressionFamilyId } from '@roamfit/data';
import {
  buildMuscleBalanceRows,
  buildProgressionBoard,
  nextUnlockHero,
  overWorkedMuscles,
} from './dashboard';

function seedAllFamilies(): Record<ProgressionFamilyId, ProgressionState> {
  const out = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of familyLibrary.families) {
    const start = calibrationStartLevel(family);
    const exercise = exerciseLibrary.exercises.find((e) => e.id === start.exercise_id)!;
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
      const exercise = exerciseLibrary.exercises.find((e) => e.id === maxLevel.exercise_id)!;
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
