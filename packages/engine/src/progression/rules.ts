/**
 * §6.3 advance/regress/drop-a-level, §6.7 mastery. Dispatches to §6.5 calibration.ts while
 * `state.calibrating` is true. This is the single state-transition function Wave 3 calls at
 * session completion — the generation pipeline itself only *reads* progression state (to pick
 * this session's variant), it never advances it.
 */
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import {
  isAtBottomMicroStep,
  microAdvance,
  microRegress,
  reconcileMicroToObservedBand,
  defaultMicroForExercise as defaultMicro,
} from './micro';
import { isMaxLevel, nextLevel, prevLevel } from './ladder';
import type { ProgressionState } from '../types';
import { CONSECUTIVE_BOTTOM_REGRESSIONS_TO_DROP_LEVEL } from './constants';
import { applyCalibrationStep } from './calibration';
import type { SessionPerformance } from './rules.types';

export type ProgressionEvent =
  | { kind: 'hold' }
  | { kind: 'micro_advance' }
  | { kind: 'micro_regress' }
  | { kind: 'level_up'; levelId: string }
  | { kind: 'level_down'; levelId: string }
  | { kind: 'mastery_pr_check' }
  | { kind: 'calibration_advance'; levelId: string }
  | { kind: 'calibration_drop'; levelId: string }
  | { kind: 'calibration_hold' };

export interface ApplySessionResult {
  state: ProgressionState;
  event: ProgressionEvent;
}

function currentExercise(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
): Exercise | undefined {
  const level = family.levels.find((l) => l.level_id === levelId);
  return level && library.find((e) => e.id === level.anchor_exercise_id);
}

export function applySessionResult(
  inputState: ProgressionState,
  family: ProgressionFamily,
  library: readonly Exercise[],
  perf: SessionPerformance,
): ApplySessionResult {
  // Reconcile to what actually happened *before* judging it. `perf.observedBand` is the band the
  // user logged having used, which may not be the one that was prescribed; every verdict below is
  // about how that session went, so it has to be read against the load the user really trained
  // with. Doing it first also means a session that both switched band and earned an advance
  // advances from the new band rather than from the abandoned prescription.
  const state: ProgressionState = (() => {
    const exercise = currentExercise(family, inputState.levelId, library);
    if (!exercise) return inputState;
    const micro = reconcileMicroToObservedBand(inputState.micro, exercise, perf.observedBand);
    return micro === inputState.micro ? inputState : { ...inputState, micro };
  })();

  if (state.calibrating) {
    const { state: next, levelChanged } = applyCalibrationStep(state, family, library, perf);
    return {
      state: next,
      event:
        levelChanged === 'up'
          ? { kind: 'calibration_advance', levelId: next.levelId }
          : levelChanged === 'down'
            ? { kind: 'calibration_drop', levelId: next.levelId }
            : { kind: 'calibration_hold' },
    };
  }

  const exercise = currentExercise(family, state.levelId, library);
  if (!exercise) return { state, event: { kind: 'hold' } };

  const shouldAdvance = perf.allSetsAtOrAboveTop && perf.difficultyFeedback !== 'too_hard';
  const shouldRegress =
    perf.missedBottom && (state.consecutiveMisses >= 1 || perf.difficultyFeedback === 'too_hard');

  if (shouldAdvance) {
    const step = microAdvance(state.micro, exercise);
    if (step.levelChange !== 'up') {
      return {
        state: {
          ...state,
          micro: step.micro,
          consecutiveHits: state.consecutiveHits + 1,
          consecutiveMisses: 0,
        },
        event: { kind: 'micro_advance' },
      };
    }
    // Micro-progression exhausted: level change due.
    if (isMaxLevel(family, state.levelId)) {
      // §6.7 Mastery — hold at the maxed micro-step; this session is a best-set PR check instead
      // of a level change (the caller compares actual performance against exerciseState.bestSet).
      return {
        state: {
          ...state,
          micro: step.micro,
          consecutiveHits: state.consecutiveHits + 1,
          consecutiveMisses: 0,
        },
        event: { kind: 'mastery_pr_check' },
      };
    }
    const next = nextLevel(family, state.levelId);
    if (!next) return { state, event: { kind: 'hold' } };
    const nextExercise = library.find((e) => e.id === next.anchor_exercise_id);
    return {
      state: {
        ...state,
        levelId: next.level_id,
        micro: nextExercise ? defaultMicro(nextExercise) : state.micro,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: state.lastLevelChangeAt,
      },
      event: { kind: 'level_up', levelId: next.level_id },
    };
  }

  if (shouldRegress) {
    const atBottom = isAtBottomMicroStep(state.micro, exercise);
    if (atBottom) {
      // Two consecutive regressions while already at the bottom micro-step drops a level.
      if (state.consecutiveMisses + 1 >= CONSECUTIVE_BOTTOM_REGRESSIONS_TO_DROP_LEVEL) {
        const prev = prevLevel(family, state.levelId);
        if (!prev) {
          return {
            state: { ...state, consecutiveMisses: state.consecutiveMisses + 1, consecutiveHits: 0 },
            event: { kind: 'hold' },
          };
        }
        const prevExercise = library.find((e) => e.id === prev.anchor_exercise_id);
        return {
          state: {
            ...state,
            levelId: prev.level_id,
            micro: prevExercise ? defaultMicro(prevExercise) : state.micro,
            consecutiveHits: 0,
            consecutiveMisses: 0,
          },
          event: { kind: 'level_down', levelId: prev.level_id },
        };
      }
      return {
        state: { ...state, consecutiveMisses: state.consecutiveMisses + 1, consecutiveHits: 0 },
        event: { kind: 'hold' },
      };
    }
    const step = microRegress(state.micro, exercise);
    return {
      state: {
        ...state,
        micro: step.micro,
        consecutiveMisses: state.consecutiveMisses + 1,
        consecutiveHits: 0,
      },
      event: { kind: 'micro_regress' },
    };
  }

  if (perf.missedBottom) {
    // First miss (not yet two consecutive, and not too_hard): track it so the *next* missed-
    // bottom session — even without a too_hard rating — triggers the regress above.
    return {
      state: { ...state, consecutiveMisses: state.consecutiveMisses + 1, consecutiveHits: 0 },
      event: { kind: 'hold' },
    };
  }

  // just_right, within range: hold, and reset both streaks.
  return {
    state: { ...state, consecutiveHits: 0, consecutiveMisses: 0 },
    event: { kind: 'hold' },
  };
}

export type { SessionPerformance } from './rules.types';

/**
 * ADR 0012 — the user's explicit "this is too easy, move me up" for one family.
 *
 * Distinct from every other transition in this file: those are *inferred* from logged
 * performance at session completion, whereas this is a direct instruction, applied the moment it
 * is given so the current session can be rewritten around it. It is deliberately repeatable —
 * a user who belongs five rungs up taps it five times and sees each exercise on the way — because
 * the cold start is now level 1 (`calibrationStartLevel`) and automatic calibration alone cannot
 * climb far enough for an already-trained user.
 *
 * The new level's micro-state resets to that level's default, exactly as a `level_up` does:
 * arriving at a rung by declaring the last one easy is still arriving at it fresh.
 *
 * Returns `undefined` at the top of the ladder — the caller should leave the plan alone and say
 * so (§6.7 Mastery is the right treatment there, not a silent no-op).
 */
export function levelUpForTooEasy(
  state: ProgressionState,
  family: ProgressionFamily,
  library: readonly Exercise[],
): ApplySessionResult | undefined {
  const next = nextLevel(family, state.levelId);
  if (!next) return undefined;
  const nextExercise = library.find((e) => e.id === next.anchor_exercise_id);
  return {
    state: {
      ...state,
      levelId: next.level_id,
      micro: nextExercise ? defaultMicro(nextExercise) : state.micro,
      // The streaks describe progress toward an *inferred* transition at the level just left.
      // They mean nothing at the new level, so they reset, as they do on any level change.
      consecutiveHits: 0,
      consecutiveMisses: 0,
      // Still calibrating if it was: a user fixing their starting rung by hand is exactly what
      // calibration is for, and ending it early would strand them if they overshoot.
      calibrating: state.calibrating,
    },
    event: { kind: 'level_up', levelId: next.level_id },
  };
}
