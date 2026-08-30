import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import { applyCalibrationStep } from './calibration';
import { findFamily } from './ladder';
import { defaultMicroForExercise } from './micro';
import type { ProgressionState } from '../types';
import type { SessionPerformance } from './rules.types';

const library = exerciseLibrary.exercises;
const family = findFamily(familyLibrary.families, 'horizontal_push')!;
const startExercise = library.find((e) => e.id === 'bw-knee-push-up')!; // horizontal_push.l3

function baseState(): ProgressionState {
  return {
    familyId: 'horizontal_push',
    levelId: 'horizontal_push.l3',
    micro: defaultMicroForExercise(startExercise),
    calibrating: true,
    consecutiveHits: 0,
    consecutiveMisses: 0,
    lastLevelChangeAt: null,
  };
}

function perf(overrides: Partial<SessionPerformance>): SessionPerformance {
  return {
    familyId: 'horizontal_push',
    allSetsAtOrAboveTop: false,
    missedBottom: false,
    difficultyFeedback: 'just_right',
    ...overrides,
  };
}

describe('§6.5 cold-start calibration', () => {
  it('too_easy advances a full level immediately, not one micro-step', () => {
    const result = applyCalibrationStep(
      baseState(),
      family,
      library,
      perf({ difficultyFeedback: 'too_easy' }),
    );
    expect(result.levelChanged).toBe('up');
    expect(result.state.levelId).toBe('horizontal_push.l4');
  });

  it('exceeding the target by >=25% advances a full level', () => {
    const result = applyCalibrationStep(
      baseState(),
      family,
      library,
      perf({ exceededTargetByRatio: 0.3 }),
    );
    expect(result.levelChanged).toBe('up');
  });

  it('missing the bottom of the range drops a full level', () => {
    const result = applyCalibrationStep(baseState(), family, library, perf({ missedBottom: true }));
    expect(result.levelChanged).toBe('down');
    expect(result.state.levelId).toBe('horizontal_push.l2');
  });

  it('just_right within range holds the level but still counts as a calibration session', () => {
    const result = applyCalibrationStep(baseState(), family, library, perf({}));
    expect(result.levelChanged).toBeNull();
    expect(result.state.levelId).toBe('horizontal_push.l3');
    expect(result.state.calibrating).toBe(true);
  });

  it('calibration ends after the 3rd session', () => {
    let state = baseState();
    state = applyCalibrationStep(state, family, library, perf({})).state;
    expect(state.calibrating).toBe(true);
    state = applyCalibrationStep(state, family, library, perf({})).state;
    expect(state.calibrating).toBe(true);
    state = applyCalibrationStep(state, family, library, perf({})).state;
    expect(state.calibrating).toBe(false);
  });
});
