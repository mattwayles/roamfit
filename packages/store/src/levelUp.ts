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
 * Invariant 2 holds: the transition itself is the engine's (`levelUpForTooEasy`). This module only
 * persists the result.
 *
 * Track 41 — a manual move is never refused for equipment (or anything else the hard filters know
 * about). Equipment is only the selections remembered for the next Generate, so "a rung needs an
 * anchor you don't have set up" is not something the app can know. The ladder position is not
 * unsafe in itself: generation still runs every hard filter (invariant 3) before any exercise on
 * the new rung is programmed, and walks down the ladder if nothing on it fits that workout.
 */
import {
  findFamily,
  levelUpForTooEasy,
  levelDownForTooHard,
  resolveLadderSlot,
} from '@roamfit/engine';
import type { EngineClock, ProgressionState, Rng } from '@roamfit/engine';
import type { Exercise, ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import type { Db } from './db';
import { logSignalEvent } from './repositories/signals';
import { getAllProgressionStates, upsertProgressionState } from './repositories/progressionState';

export type LevelUpOutcome =
  /** Advanced. `exerciseName` is the new rung's exercise, for the confirmation copy. */
  | { status: 'levelled_up'; exerciseId: string; exerciseName: string; levelId: string }
  /** Already at the top of this ladder — §6.7 Mastery territory, not a failure. */
  | { status: 'at_max' }
  /** No such family, or no progression state for it yet. */
  | { status: 'unknown_family' };

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
  const { familyId, library, families, clock } = input;

  const family = findFamily(families.families, familyId);
  if (!family) return { status: 'unknown_family' };

  const states = getAllProgressionStates(db);
  const state = states[familyId];
  if (!state) return { status: 'unknown_family' };

  const advanced = levelUpForTooEasy(state, family, library.exercises);
  if (!advanced) return { status: 'at_max' };

  const exercise = rungExercise(input, states, advanced.state);
  upsertProgressionState(db, advanced.state, now);

  logSignalEvent(db, {
    sessionId: null,
    type: 'level_up_too_easy',
    payload: {
      familyId,
      fromLevelId: state.levelId,
      toLevelId: advanced.state.levelId,
      toExerciseId: exercise.id,
    },
    utcInstant: now,
    localDate: clock.today,
  });

  return {
    status: 'levelled_up',
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    levelId: advanced.state.levelId,
  };
}

/**
 * The symmetric counterpart to `levelUpFamily` above — "this rung is above me", dropped one
 * level. Same home (the progression board, no session required), same division of labor
 * (`levelDownForTooHard` is the engine's transition; this module only persists it).
 */
export type LevelDownOutcome =
  /** Dropped. `exerciseName` is the new (lower) rung's exercise, for the confirmation copy. */
  | { status: 'levelled_down'; exerciseId: string; exerciseName: string; levelId: string }
  /** Already at the bottom of this ladder — level 1 is the floor. */
  | { status: 'at_min' }
  /** No such family, or no progression state for it yet. */
  | { status: 'unknown_family' };

export interface LevelDownInput {
  familyId: ProgressionFamilyId;
  library: ExerciseLibrary;
  families: FamilyLibrary;
  clock: EngineClock;
  /** Only used to pick among the new rung's sibling exercises (ADR 0010) so the result can name
   *  one. Nothing from the draw is persisted — which sibling gets programmed is decided fresh at
   *  generation, as always. */
  rng: Rng;
}

export function levelDownFamily(db: Db, input: LevelDownInput, now: string): LevelDownOutcome {
  const { familyId, library, families, clock } = input;

  const family = findFamily(families.families, familyId);
  if (!family) return { status: 'unknown_family' };

  const states = getAllProgressionStates(db);
  const state = states[familyId];
  if (!state) return { status: 'unknown_family' };

  const dropped = levelDownForTooHard(state, family, library.exercises);
  if (!dropped) return { status: 'at_min' };

  const exercise = rungExercise(input, states, dropped.state);
  upsertProgressionState(db, dropped.state, now);

  logSignalEvent(db, {
    sessionId: null,
    type: 'level_down_too_hard',
    payload: {
      familyId,
      fromLevelId: state.levelId,
      toLevelId: dropped.state.levelId,
      toExerciseId: exercise.id,
    },
    utcInstant: now,
    localDate: clock.today,
  });

  return {
    status: 'levelled_down',
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    levelId: dropped.state.levelId,
  };
}

/** One exercise from the new rung itself, to name in the confirmation copy. Drawn from the whole
 *  library — nothing about the user's equipment or filters applies to a manual move. */
function rungExercise(
  input: LevelUpInput,
  states: ReturnType<typeof getAllProgressionStates>,
  next: ProgressionState,
): Exercise {
  const resolved = resolveLadderSlot({
    familyId: input.familyId,
    families: input.families.families,
    library: input.library.exercises,
    progressionStates: { ...states, [input.familyId]: next },
    hardFilteredPool: input.library.exercises,
    rng: input.rng,
    // The rung just moved to, not a lower one pooled in for variety (track 14).
    includeLowerRungs: false,
  });
  // Every rung has at least one exercise in the library (data validators), so this always
  // resolves; the throw is a guard against a broken library, not a user-facing state.
  if (!resolved) throw new Error(`no exercise on ${next.levelId}`);
  return resolved.exercise;
}
