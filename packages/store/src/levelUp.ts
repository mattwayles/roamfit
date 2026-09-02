/**
 * ADR 0012 — "this rung is below me", raised one level.
 *
 * This operates on the **family**, not on a session entry. It was originally wired to a button on
 * a planned exercise (approval, then mid-workout), which meant advancing the ladder and rewriting
 * that session's entry in one step. Device feedback moved the control to the §14.1.4 progression
 * board instead, which is the honest home for it: a ladder position is a property of the user,
 * not of whatever session happens to be on screen, and the board is the one place that already
 * shows "Level 3 of 9 — Knee Push-Up". Adjusting it there, before generating, is also the only
 * version that needs no session to exist at all.
 *
 * Invariant 2 holds: the transition itself is the engine's (`levelUpForTooEasy`) and eligibility
 * is the engine's hard filters. This module only persists the result.
 */
import {
  applyHardFilters,
  findFamily,
  levelUpForTooEasy,
  resolveLadderSlot,
} from '@roamfit/engine';
import type { EngineClock, Rng } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import type { Db } from './db';
import { logSignalEvent } from './repositories/signals';
import { buildUserProfile } from './repositories/users';
import { getAllProgressionStates, upsertProgressionState } from './repositories/progressionState';

export type LevelUpOutcome =
  /** Advanced. `exerciseName` is the new rung's exercise, for the confirmation copy. */
  | { status: 'levelled_up'; exerciseId: string; exerciseName: string; levelId: string }
  /** Already at the top of this ladder — §6.7 Mastery territory, not a failure. */
  | { status: 'at_max' }
  /** No such family, or no progression state for it yet. */
  | { status: 'unknown_family' }
  /** The next rung exists, but every exercise on it is hard-filtered out for this user (anchor or
   *  limitation). Nothing is written — moving someone onto a rung they cannot perform would
   *  strand them there, with no way off it but failing it. */
  | { status: 'no_eligible_exercise' };

export interface LevelUpInput {
  familyId: ProgressionFamilyId;
  library: ExerciseLibrary;
  families: FamilyLibrary;
  clock: EngineClock;
  /** Only used to pick among the new rung's sibling exercises (ADR 0010) so the result can name
   *  one. Nothing from the draw is persisted — which sibling gets programmed is decided fresh at
   *  generation, as always. */
  rng: Rng;
}

export function levelUpFamily(db: Db, input: LevelUpInput, now: string): LevelUpOutcome {
  const { familyId, library, families, clock, rng } = input;

  const family = findFamily(families.families, familyId);
  if (!family) return { status: 'unknown_family' };

  const states = getAllProgressionStates(db);
  const state = states[familyId];
  if (!state) return { status: 'unknown_family' };

  const advanced = levelUpForTooEasy(state, family, library.exercises);
  if (!advanced) return { status: 'at_max' };

  // Check the new rung against the user's real hard filters BEFORE committing.
  const profile = buildUserProfile(db, clock.today);
  const pool = applyHardFilters({
    library: library.exercises,
    request: { equipmentPreference: 'any' },
    anchorsAvailable: profile.anchorsAvailable,
    limitations: profile.limitations,
    today: clock.today,
  });
  const resolved = resolveLadderSlot({
    familyId,
    families: families.families,
    library: library.exercises,
    progressionStates: { ...states, [familyId]: advanced.state },
    hardFilteredPool: pool,
    rng,
  });
  // `resolveLadderSlot` walks *down* when a rung is unavailable, which is right during generation
  // and wrong here: a walk-down means the rung just unlocked has nothing the user can actually do.
  if (!resolved || resolved.substitutedFrom) return { status: 'no_eligible_exercise' };

  upsertProgressionState(db, advanced.state, now);

  logSignalEvent(db, {
    sessionId: null,
    type: 'level_up_too_easy',
    payload: {
      familyId,
      fromLevelId: state.levelId,
      toLevelId: advanced.state.levelId,
      toExerciseId: resolved.exercise.id,
    },
    utcInstant: now,
    localDate: clock.today,
  });

  return {
    status: 'levelled_up',
    exerciseId: resolved.exercise.id,
    exerciseName: resolved.exercise.name,
    levelId: advanced.state.levelId,
  };
}
