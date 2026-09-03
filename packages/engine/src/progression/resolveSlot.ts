/**
 * The missing link between progression state and a concrete per-session exercise for one of the
 * 8 laddered-family template slots (§6.6). Per the architecture decision recorded in
 * STATUS-2-engine.md: a laddered slot's exercise comes directly from `ProgressionState.levelId`,
 * not from `selection/mainSelection.ts`'s variety machinery — repeating the same exercise while
 * the user sits at a stable level is progressive overload working as intended, not a BLOCKED
 * violation.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';
import {
  exerciseForLevel,
  exercisesBelowLevel,
  exercisesForLevel,
  findFamily,
  prevLevel,
} from './ladder';
import { CURRENT_RUNG_WEIGHT } from './constants';
import { isDifficultyEligible } from '../filters/hardFilters';
import { rngIndex } from '../rng';
import type { Difficulty, ProgressionState, Rng } from '../types';

export interface ResolvedLadderSlot {
  exercise: Exercise;
  family: ProgressionFamily;
  state: ProgressionState;
  /** Set when the current level's exercise failed a hard filter and a lower level was
   *  substituted for this session only — the caller should NOT persist a level change and
   *  should surface this in the explanation line (§5.8). */
  substitutedFrom?: { levelId: string; exerciseId: string };
  /** Set when the weighted current-vs-lower-rung draw deliberately picked an exercise from a
   *  rung below the current one. Unlike `substitutedFrom`, this is not a failure or a
   *  regression — it's ordinary variety once a lower rung has been achieved — but the caller may
   *  still want to name it in the explanation line (§5.8). `state.levelId` is unaffected either
   *  way. */
  pulledFromLevelId?: string;
}

export interface ResolveSlotInput {
  familyId: ProgressionFamilyId;
  families: readonly ProgressionFamily[];
  library: readonly Exercise[];
  progressionStates: Readonly<Record<ProgressionFamilyId, ProgressionState>>;
  /** The already hard-filtered pool (§5.1 step 1) — anchor/injury/equipment eligible. */
  hardFilteredPool: readonly Exercise[];
  /** The session's requested difficulty — gates which lower-rung exercises are eligible via
   *  `isDifficultyEligible` (§5.1's exercise-selection eligibility rule, shared with
   *  `mainSelection.ts`). Does not affect the current rung's own eligible set — the user's
   *  assigned progression level stays reachable regardless of today's requested difficulty, so
   *  progressive overload isn't interrupted by picking "easy" on an off day. Unused (and
   *  optional) when `includeLowerRungs` is false. */
  difficulty?: Difficulty;
  /** Seeded RNG used to pick among a level's siblings (ADR 0010). */
  rng: Rng;
  /** Exercise ids programmed in the most recent non-discarded session. A sibling in this set is
   *  skipped when the level offers an alternative, so consecutive sessions differ. */
  recentExerciseIds?: ReadonlySet<string>;
  /** Default true. Set false to consider only the current rung — used by `levelUpFamily`
   *  (ADR 0012's manual "too easy" advance), which is checking whether the *newly unlocked*
   *  rung itself has an eligible exercise and needs to name one from it, not from a rung the
   *  user already mastered. */
  includeLowerRungs?: boolean;
}

/**
 * Picks one exercise from a candidate list, preferring one not used in the most recent session
 * so consecutive sessions differ, and falling back to the full eligible set when every candidate
 * was recently used (or there is only one).
 */
function pickFromPool(
  candidates: readonly Exercise[],
  filteredIds: ReadonlySet<string>,
  rng: Rng,
  recentExerciseIds: ReadonlySet<string>,
): Exercise | undefined {
  const eligible = candidates.filter((e) => filteredIds.has(e.id));
  if (eligible.length === 0) return undefined;
  const fresh = eligible.filter((e) => !recentExerciseIds.has(e.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return pool[rngIndex(rng, pool.length)];
}

/** Picks one exercise from a level's own sibling set (ADR 0010) — see `pickFromPool`. */
function pickAtLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
  filteredIds: ReadonlySet<string>,
  rng: Rng,
  recentExerciseIds: ReadonlySet<string>,
): Exercise | undefined {
  return pickFromPool(
    exercisesForLevel(family, levelId, library),
    filteredIds,
    rng,
    recentExerciseIds,
  );
}

/**
 * Picks the exercise for a laddered slot from the current rung and every rung the user has
 * already achieved below it, weighted `CURRENT_RUNG_WEIGHT` toward the current rung when both
 * have eligible candidates — mastering a level doesn't retire its exercises, but progressive
 * overload stays the dominant signal. The lower-rung pool is additionally gated by
 * `isDifficultyEligible` — without this, pooling in every achieved rung could surface an
 * easy-difficulty level-1 exercise in a user-selected hard workout, which a stricter reading of
 * "hard" than the current rung alone provides for. The current rung's own pool is not gated
 * (pre-existing behavior — see the `difficulty` field doc on `ResolveSlotInput`).
 *
 * Returns a tagged result so the caller can tell three cases apart: an ordinary current-rung
 * pick, a deliberate lower-rung pick (variety — see `pulledFromLevelId` on `ResolvedLadderSlot`),
 * and the current rung being entirely hard-filtered out (a failure, same meaning as the
 * pre-existing walk-down's `substitutedFrom` — NOT variety, even though it also draws from the
 * lower pool).
 */
function pickLadderCandidate(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
  filteredIds: ReadonlySet<string>,
  rng: Rng,
  recentExerciseIds: ReadonlySet<string>,
  difficulty: Difficulty,
):
  { exercise: Exercise; reason: 'current' | 'lower-weighted' | 'current-unavailable' } | undefined {
  const currentCandidates = exercisesForLevel(family, levelId, library);
  const lowerCandidates = exercisesBelowLevel(family, levelId, library).filter((e) =>
    isDifficultyEligible(e, difficulty),
  );
  const currentEligible = currentCandidates.filter((e) => filteredIds.has(e.id));
  const lowerEligible = lowerCandidates.filter((e) => filteredIds.has(e.id));

  if (currentEligible.length === 0) {
    const exercise = pickFromPool(lowerCandidates, filteredIds, rng, recentExerciseIds);
    return exercise ? { exercise, reason: 'current-unavailable' } : undefined;
  }
  if (lowerEligible.length === 0) {
    const exercise = pickFromPool(currentCandidates, filteredIds, rng, recentExerciseIds);
    return exercise ? { exercise, reason: 'current' } : undefined;
  }

  const useCurrent = rng.next() < CURRENT_RUNG_WEIGHT;
  const exercise = pickFromPool(
    useCurrent ? currentCandidates : lowerCandidates,
    filteredIds,
    rng,
    recentExerciseIds,
  );
  return exercise ? { exercise, reason: useCurrent ? 'current' : 'lower-weighted' } : undefined;
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
 * anchor, never the sibling picked here — true whether the sibling came from the current rung or
 * (per `pickLadderCandidate`) an already-achieved rung below it.
 */
export function resolveLadderSlot(input: ResolveSlotInput): ResolvedLadderSlot | undefined {
  const { familyId, families, library, progressionStates, hardFilteredPool, rng } = input;
  const recentExerciseIds = input.recentExerciseIds ?? new Set<string>();
  const includeLowerRungs = input.includeLowerRungs ?? true;
  const family = findFamily(families, familyId);
  const state = progressionStates[familyId];
  if (!family || !state) return undefined;

  const filteredIds = new Set(hardFilteredPool.map((e) => e.id));
  const anchorAtCurrentLevel = exerciseForLevel(family, state.levelId, library);

  if (!includeLowerRungs) {
    const chosen = pickAtLevel(family, state.levelId, library, filteredIds, rng, recentExerciseIds);
    if (chosen) return { exercise: chosen, family, state };
  } else {
    const picked = pickLadderCandidate(
      family,
      state.levelId,
      library,
      filteredIds,
      rng,
      recentExerciseIds,
      input.difficulty ?? 'medium',
    );
    if (picked) {
      if (picked.reason === 'lower-weighted') {
        return { exercise: picked.exercise, family, state, pulledFromLevelId: state.levelId };
      }
      if (picked.reason === 'current-unavailable') {
        return {
          exercise: picked.exercise,
          family,
          state,
          substitutedFrom: { levelId: state.levelId, exerciseId: anchorAtCurrentLevel?.id ?? '' },
        };
      }
      return { exercise: picked.exercise, family, state };
    }
  }

  // Every exercise at the current level (and every achieved rung below it) is filtered out —
  // walk further down to the nearest level that has one that survives. `substitutedFrom` names
  // the level's anchor, since that is what the user's progression is actually parked on.
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
