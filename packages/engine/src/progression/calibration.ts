/**
 * §6.5 cold-start calibration — the first `CALIBRATION_SESSIONS` sessions of a family run in
 * calibration mode: `too_easy` or exceeding the rep/hold target by ≥25% jumps a full level
 * immediately; missing the bottom of the range drops a full level immediately. No assessment
 * flow, no questions asked.
 */
import type { ProgressionFamily } from '@roamfit/data';
import { nextLevel, prevLevel } from './ladder';
import { defaultMicroForExercise } from './micro';
import type { Exercise } from '@roamfit/data';
import type { ProgressionState } from '../types';
import { CALIBRATION_OVERSHOOT_RATIO, CALIBRATION_SESSIONS } from './constants';
import type { SessionPerformance } from './rules.types';

export interface CalibrationStepResult {
  state: ProgressionState;
  /** For the one-time first-session notice (§6.5) and milestone logging, mirroring level-ups. */
  levelChanged: 'up' | 'down' | null;
}

export function applyCalibrationStep(
  state: ProgressionState,
  family: ProgressionFamily,
  library: readonly Exercise[],
  perf: SessionPerformance,
): CalibrationStepResult {
  const overshoot = (perf.exceededTargetByRatio ?? 0) >= CALIBRATION_OVERSHOOT_RATIO;
  const shouldAdvance = perf.difficultyFeedback === 'too_easy' || overshoot;
  const shouldDrop = perf.missedBottom;

  const sessionsSoFar = state.consecutiveHits + state.consecutiveMisses + 1;
  const stillCalibrating = sessionsSoFar < CALIBRATION_SESSIONS;

  if (shouldDrop) {
    const prev = prevLevel(family, state.levelId);
    if (!prev) {
      return {
        state: {
          ...state,
          calibrating: stillCalibrating,
          consecutiveMisses: state.consecutiveMisses + 1,
        },
        levelChanged: null,
      };
    }
    const exercise = library.find((e) => e.id === prev.exercise_id);
    return {
      state: {
        ...state,
        levelId: prev.level_id,
        micro: exercise ? defaultMicroForExercise(exercise) : state.micro,
        calibrating: stillCalibrating,
        consecutiveMisses: state.consecutiveMisses + 1,
        consecutiveHits: 0,
        lastLevelChangeAt: state.lastLevelChangeAt,
      },
      levelChanged: 'down',
    };
  }

  if (shouldAdvance) {
    const next = nextLevel(family, state.levelId);
    if (!next) {
      return {
        state: {
          ...state,
          calibrating: stillCalibrating,
          consecutiveHits: state.consecutiveHits + 1,
        },
        levelChanged: null,
      };
    }
    const exercise = library.find((e) => e.id === next.exercise_id);
    return {
      state: {
        ...state,
        levelId: next.level_id,
        micro: exercise ? defaultMicroForExercise(exercise) : state.micro,
        calibrating: stillCalibrating,
        consecutiveHits: state.consecutiveHits + 1,
        consecutiveMisses: 0,
      },
      levelChanged: 'up',
    };
  }

  // just_right, within range: hold. Still counts as a calibration session.
  return {
    state: { ...state, calibrating: stillCalibrating, consecutiveHits: state.consecutiveHits + 1 },
    levelChanged: null,
  };
}
