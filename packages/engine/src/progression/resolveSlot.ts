/**
 * The missing link between progression state and a concrete per-session exercise for one of the
 * 8 laddered-family template slots (§6.6). Per the architecture decision recorded in
 * STATUS-2-engine.md: a laddered slot's exercise comes directly from `ProgressionState.levelId`,
 * not from `selection/mainSelection.ts`'s variety machinery — repeating the same exercise while
 * the user sits at a stable level is progressive overload working as intended, not a BLOCKED
 * violation.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';
import { exerciseForLevel, findFamily, prevLevel } from './ladder';
import type { ProgressionState } from '../types';

export interface ResolvedLadderSlot {
  exercise: Exercise;
  family: ProgressionFamily;
  state: ProgressionState;
  /** Set when the current level's exercise failed a hard filter and a lower level was
   *  substituted for this session only — the caller should NOT persist a level change and
   *  should surface this in the explanation line (§5.8). */
  substitutedFrom?: { levelId: string; exerciseId: string };
}

export interface ResolveSlotInput {
  familyId: ProgressionFamilyId;
  families: readonly ProgressionFamily[];
  library: readonly Exercise[];
  progressionStates: Readonly<Record<ProgressionFamilyId, ProgressionState>>;
  /** The already hard-filtered pool (§5.1 step 1) — anchor/injury/equipment eligible. */
  hardFilteredPool: readonly Exercise[];
}

/**
 * Resolves a laddered pattern slot to a concrete exercise. Walks down the ladder from the
 * user's current level if that level's exercise fails a hard filter, since a stored level_id can
 * point at an exercise the user currently can't do (e.g. their pull-up bar anchor got disabled,
 * or a new limitation excludes it) without that meaning their progression regressed. Returns
 * `undefined` only when every level of the ladder, down to level 1, fails the hard filters — at
 * that point the pattern truly has no eligible exercise and the caller should record a
 * PATTERN GAP instead.
 */
export function resolveLadderSlot(input: ResolveSlotInput): ResolvedLadderSlot | undefined {
  const { familyId, families, library, progressionStates, hardFilteredPool } = input;
  const family = findFamily(families, familyId);
  const state = progressionStates[familyId];
  if (!family || !state) return undefined;

  const filteredIds = new Set(hardFilteredPool.map((e) => e.id));
  const currentExercise = exerciseForLevel(family, state.levelId, library);
  if (currentExercise && filteredIds.has(currentExercise.id)) {
    return { exercise: currentExercise, family, state };
  }

  // Current level's exercise is filtered out — walk down to the nearest level that survives.
  let cursor = state.levelId;
  let candidate = currentExercise;
  while (candidate) {
    const prev = prevLevel(family, cursor);
    if (!prev) break;
    const prevExercise = library.find((e) => e.id === prev.exercise_id);
    if (prevExercise && filteredIds.has(prevExercise.id)) {
      return {
        exercise: prevExercise,
        family,
        state,
        substitutedFrom: { levelId: state.levelId, exerciseId: currentExercise?.id ?? '' },
      };
    }
    cursor = prev.level_id;
    candidate = prevExercise;
  }

  return undefined;
}
