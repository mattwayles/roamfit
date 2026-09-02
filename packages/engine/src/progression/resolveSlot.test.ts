import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { resolveLadderSlot } from './resolveSlot';
import { calibrationStartLevel, findFamily } from './ladder';
import { defaultMicroForExercise } from './micro';
import type { ProgressionState } from '../types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const horizontalPush = findFamily(families, 'horizontal_push')!;

function allFamilyStates(
  overrides: Partial<Record<ProgressionFamilyId, ProgressionState>> = {},
): Record<ProgressionFamilyId, ProgressionState> {
  const out = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    out[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: false,
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return { ...out, ...overrides };
}

describe('resolveLadderSlot', () => {
  it('returns the exercise at the current level when it survives the hard filters', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l5', // banded-push-up
        micro: defaultMicroForExercise(library.find((e) => e.id === 'banded-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: library, // nothing filtered
    });
    expect(result?.exercise.id).toBe('banded-push-up');
    expect(result?.substitutedFrom).toBeUndefined();
  });

  it('walks down the ladder when the current level exercise fails a hard filter, and flags it', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l5', // banded-push-up
        micro: defaultMicroForExercise(library.find((e) => e.id === 'banded-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    const withoutL5 = library.filter((e) => e.id !== 'banded-push-up');
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: withoutL5,
    });
    expect(result?.exercise.id).toBe('bw-push-up'); // horizontal_push.l4
    expect(result?.substitutedFrom).toEqual({
      levelId: 'horizontal_push.l5',
      exerciseId: 'banded-push-up',
    });
  });

  it('is undefined when every level of the ladder fails the hard filters (a PATTERN GAP for the caller)', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l2',
        micro: defaultMicroForExercise(library.find((e) => e.id === 'bw-incline-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    // Every exercise on every rung — siblings included (ADR 0010), not just the anchors, or the
    // ladder would still have something to resolve to.
    const horizontalPushIds = new Set(horizontalPush.levels.flatMap((l) => l.exercise_ids));
    const withoutHorizontalPush = library.filter((e) => !horizontalPushIds.has(e.id));
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: withoutHorizontalPush,
    });
    expect(result).toBeUndefined();
  });

  it('is undefined for an unknown family id', () => {
    const result = resolveLadderSlot({
      familyId: 'not_a_real_family' as ProgressionFamilyId,
      families,
      library,
      progressionStates: allFamilyStates(),
      hardFilteredPool: library,
    });
    expect(result).toBeUndefined();
  });
});
