/**
 * The missing link between progression state and a concrete per-session exercise for one of the
 * 8 laddered-family template slots (§6.6). Per the architecture decision recorded in
 * STATUS-2-engine.md: a laddered slot's exercise comes directly from `ProgressionState.levelId`,
 * not from `selection/mainSelection.ts`'s variety machinery — repeating the same exercise while
 * the user sits at a stable level is progressive overload working as intended, not a BLOCKED
 * violation.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';
import { exerciseForLevel, exercisesForLevel, findFamily, prevLevel } from './ladder';
import { rngIndex } from '../rng';
import type { ProgressionState, Rng } from '../types';

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
  /** Seeded RNG used to pick among a level's siblings (ADR 0010). */
  rng: Rng;
  /** Exercise ids programmed in the most recent non-discarded session. A sibling in this set is
   *  skipped when the level offers an alternative, so consecutive sessions differ. */
  recentExerciseIds?: ReadonlySet<string>;
}

/**
 * Picks one exercise from a level's sibling set (ADR 0010), preferring one not used in the most
 * recent session so consecutive sessions differ, and falling back to the full eligible set when
 * every sibling was recently used (or the level has only one).
 */
function pickAtLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
  filteredIds: ReadonlySet<string>,
  rng: Rng,
  recentExerciseIds: ReadonlySet<string>,
): Exercise | undefined {
  const eligible = exercisesForLevel(family, levelId, library).filter((e) => filteredIds.has(e.id));
  if (eligible.length === 0) return undefined;
  const fresh = eligible.filter((e) => !recentExerciseIds.has(e.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return pool[rngIndex(rng, pool.length)];
}

/**
 * Resolves a laddered pattern slot to a concrete exercise. Walks down the ladder from the
 * user's current level if that level's exercises all fail a hard filter, since a stored level_id
 * can point at exercises the user currently can't do (e.g. their pull-up bar anchor got disabled,
 * or a new limitation excludes them) without that meaning their progression regressed. Returns
 * `undefined` only when every level of the ladder, down to level 1, fails the hard filters — at
 * that point the pattern truly has no eligible exercise and the caller should record a
 * PATTERN GAP instead.
 *
 * Which *sibling* is programmed is an RNG draw (ADR 0010) and carries no progression meaning:
 * `state.levelId` is unchanged by it, and all micro-progression math runs against the level's
 * anchor, never the sibling picked here.
 */
export function resolveLadderSlot(input: ResolveSlotInput): ResolvedLadderSlot | undefined {
  const { familyId, families, library, progressionStates, hardFilteredPool, rng } = input;
  const recentExerciseIds = input.recentExerciseIds ?? new Set<string>();
  const family = findFamily(families, familyId);
  const state = progressionStates[familyId];
  if (!family || !state) return undefined;

  const filteredIds = new Set(hardFilteredPool.map((e) => e.id));
  const chosen = pickAtLevel(family, state.levelId, library, filteredIds, rng, recentExerciseIds);
  if (chosen) {
    return { exercise: chosen, family, state };
  }

  // Every exercise at the current level is filtered out — walk down to the nearest level that
  // has one that survives. `substitutedFrom` names the level's anchor, since that is what the
  // user's progression is actually parked on.
  const anchorAtCurrentLevel = exerciseForLevel(family, state.levelId, library);
  let cursor = state.levelId;
  for (;;) {
    const prev = prevLevel(family, cursor);
    if (!prev) break;
    const prevChoice = pickAtLevel(
      family,
      prev.level_id,
      library,
      filteredIds,
      rng,
      recentExerciseIds,
    );
    if (prevChoice) {
      return {
        exercise: prevChoice,
        family,
        state,
        substitutedFrom: { levelId: state.levelId, exerciseId: anchorAtCurrentLevel?.id ?? '' },
      };
    }
    cursor = prev.level_id;
  }

  return undefined;
}
