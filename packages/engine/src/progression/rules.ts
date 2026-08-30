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
  return level && library.find((e) => e.id === level.exercise_id);
}

export function applySessionResult(
  state: ProgressionState,
  family: ProgressionFamily,
  library: readonly Exercise[],
  perf: SessionPerformance,
): ApplySessionResult {
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
    const nextExercise = library.find((e) => e.id === next.exercise_id);
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
        const prevExercise = library.find((e) => e.id === prev.exercise_id);
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
