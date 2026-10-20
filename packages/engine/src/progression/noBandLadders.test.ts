import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import { applyHardFilters, FIXED_POINT_ANCHORS } from '../filters/hardFilters';
import { defaultMicroForExercise } from './micro';
import { resolveLadderSlot } from './resolveSlot';
import { createRng } from '../rng';
import type { ProgressionState } from '../types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;

describe('a user who owns no bands', () => {
  // Every anchor and fixed point, but no bands: the only thing taken away is the band exercises.
  const pool = applyHardFilters({
    library,
    request: { equipmentPreference: undefined },
    anchorsAvailable: [...FIXED_POINT_ANCHORS],
    limitations: [],
    disabledExerciseIds: new Set(),
    today: '2026-10-18',
    ownsBands: false,
  });

  it('is served the rung they are on, never a lower substitute, on every rung of every ladder', () => {
    for (const family of families) {
      for (const level of family.levels) {
        const anchor = library.find((e) => e.id === level.anchor_exercise_id)!;
        const state: ProgressionState = {
          familyId: family.id,
          levelId: level.level_id,
          micro: defaultMicroForExercise(anchor),
          consecutiveHits: 0,
          consecutiveMisses: 0,
          lastLevelChangeAt: null,
        };
        for (const seed of [1, 2, 3]) {
          const result = resolveLadderSlot({
            familyId: family.id,
            families,
            library,
            progressionStates: { [family.id]: state } as never,
            hardFilteredPool: pool,
            rng: createRng(seed),
            includeLowerRungs: false,
          });
          expect({ level: level.level_id, found: result !== undefined }).toEqual({
            level: level.level_id,
            found: true,
          });
          expect(result!.substitutedFrom).toBeUndefined();
          expect(result!.exercise.equipment).toBe('bodyweight');
          expect(level.exercise_ids).toContain(result!.exercise.id);
        }
      }
    }
  });
});
