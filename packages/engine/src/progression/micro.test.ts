import { exerciseLibrary } from '@roamfit/data';
import {
  defaultMicroForExercise,
  microAdvance,
  microRegress,
  isAtBottomMicroStep,
  microStepsToNextLevel,
} from './micro';
import type { ProgressionMicroState } from '../types';

const library = exerciseLibrary.exercises;
const bodyweightPush = library.find((e) => e.id === 'bw-wall-push-up')!; // horizontal_push.l1
const bandedPush = library.find((e) => e.id === 'banded-push-up')!; // horizontal_push.l5, "B1-B2"

describe('§6.2 micro-progression', () => {
  it('starts at the bottom of the rep range with the lightest suggested band', () => {
    expect(defaultMicroForExercise(bandedPush)).toEqual({
      repTarget: 10,
      band: 'B1',
      tempoSec: 3,
      restSec: 45,
      sets: 3,
    });
    expect(defaultMicroForExercise(bodyweightPush).band).toBeNull();
  });

  it('band order: reps to top of range, then band +1 with reps reset, then next level', () => {
    let micro = defaultMicroForExercise(bandedPush);
    let step = microAdvance(micro, bandedPush);
    expect(step).toEqual({ micro: { ...micro, repTarget: 11 }, levelChange: null });
    micro = step.micro;
    step = microAdvance(micro, bandedPush);
    expect(step.micro.repTarget).toBe(12);
    micro = step.micro;

    // top of range at B1 -> band bumps to B2, reps reset to bottom (10).
    step = microAdvance(micro, bandedPush);
    expect(step).toEqual({ micro: { ...micro, band: 'B2', repTarget: 10 }, levelChange: null });
    micro = step.micro;

    step = microAdvance(micro, bandedPush); // 10 -> 11
    micro = step.micro;
    step = microAdvance(micro, bandedPush); // 11 -> 12, now at max band + top of range
    micro = step.micro;
    expect(micro).toEqual({ repTarget: 12, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 });

    step = microAdvance(micro, bandedPush);
    expect(step.levelChange).toBe('up');
    expect(step.micro).toEqual(micro); // unchanged; caller decides what the level change means
  });

  it('bodyweight order: reps to top, then tempo +1s, rest -15s, sets +1, then next level', () => {
    let micro = defaultMicroForExercise(bodyweightPush);
    micro = microAdvance(micro, bodyweightPush).micro; // 10 -> 11
    micro = microAdvance(micro, bodyweightPush).micro; // 11 -> 12
    expect(micro.repTarget).toBe(12);

    micro = microAdvance(micro, bodyweightPush).micro;
    expect(micro.tempoSec).toBe(4);

    micro = microAdvance(micro, bodyweightPush).micro;
    expect(micro.restSec).toBe(30);

    micro = microAdvance(micro, bodyweightPush).micro;
    expect(micro.sets).toBe(4);

    const final = microAdvance(micro, bodyweightPush);
    expect(final.levelChange).toBe('up');
  });

  it('regress is the exact reverse order of advance', () => {
    let micro: ProgressionMicroState = {
      repTarget: 12,
      band: null,
      tempoSec: 4,
      restSec: 30,
      sets: 4,
    };
    micro = microRegress(micro, bodyweightPush).micro;
    expect(micro.sets).toBe(3);
    micro = microRegress(micro, bodyweightPush).micro;
    expect(micro.restSec).toBe(45);
    micro = microRegress(micro, bodyweightPush).micro;
    expect(micro.tempoSec).toBe(3);
    micro = microRegress(micro, bodyweightPush).micro;
    expect(micro.repTarget).toBe(11);
  });

  it('regressing past the bottom of level 1 signals levelChange: down', () => {
    const bottom = defaultMicroForExercise(bodyweightPush);
    const step = microRegress(bottom, bodyweightPush);
    expect(step.levelChange).toBe('down');
  });

  it('isAtBottomMicroStep is true only at the exact floor', () => {
    const bottom = defaultMicroForExercise(bodyweightPush);
    expect(isAtBottomMicroStep(bottom, bodyweightPush)).toBe(true);
    const oneUp = microAdvance(bottom, bodyweightPush).micro;
    expect(isAtBottomMicroStep(oneUp, bodyweightPush)).toBe(false);
  });

  it('timed exercises use a seconds range instead of a rep range (§6.3)', () => {
    const timed = { ...bodyweightPush, metric: 'time' as const, default_seconds: 30 };
    const micro = defaultMicroForExercise(timed);
    expect(micro.repTarget).toBe(20); // PROGRESSION_TIME_LOW_SEC
  });
});

describe('§6.4/§14.1.3 microStepsToNextLevel — Next Unlock substrate', () => {
  it('counts down to exactly 1 the step before a level change fires', () => {
    let micro = defaultMicroForExercise(bodyweightPush);
    let remaining = microStepsToNextLevel(micro, bodyweightPush);
    expect(remaining).not.toBeNull();
    // Walk the real sequence and confirm the count decreases by exactly 1 each real advance,
    // hitting 1 on the step immediately before levelChange fires.
    for (let i = 0; i < (remaining as number) - 1; i += 1) {
      const step = microAdvance(micro, bodyweightPush);
      expect(step.levelChange).toBeNull();
      micro = step.micro;
      const nextRemaining = microStepsToNextLevel(micro, bodyweightPush);
      expect(nextRemaining).toBe((remaining as number) - (i + 1));
    }
    expect(microStepsToNextLevel(micro, bodyweightPush)).toBe(1);
    const finalStep = microAdvance(micro, bodyweightPush);
    expect(finalStep.levelChange).toBe('up');
  });

  it('is smaller near the top of a level than at the very start of one (band exercise)', () => {
    const start = defaultMicroForExercise(bandedPush);
    const atStart = microStepsToNextLevel(start, bandedPush) as number;
    const oneStepIn = microAdvance(start, bandedPush).micro;
    const afterOneStep = microStepsToNextLevel(oneStepIn, bandedPush) as number;
    expect(afterOneStep).toBe(atStart - 1);
  });

  it('never returns 0 or a negative count', () => {
    const micro = defaultMicroForExercise(bodyweightPush);
    const remaining = microStepsToNextLevel(micro, bodyweightPush);
    expect(remaining).toBeGreaterThan(0);
  });
});
