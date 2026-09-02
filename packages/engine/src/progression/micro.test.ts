import { exerciseLibrary } from '@roamfit/data';
import {
  defaultMicroForExercise,
  microAdvance,
  microRegress,
  isAtBottomMicroStep,
  microStepsToNextLevel,
  reconcileMicroToObservedBand,
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

describe('§6.2 reconcileMicroToObservedBand — the band the user actually used', () => {
  // "B3-B5" in the library, so there is room to observe a band above, below and outside the range.
  const wideRange = library.find((e) => e.equipment === 'band' && e.band === 'B3-B5')!;

  it('adopts a heavier observed band and resets reps to the bottom of the range', () => {
    const micro = defaultMicroForExercise(wideRange); // B3, reps at the bottom
    const next = reconcileMicroToObservedBand({ ...micro, repTarget: 12 }, wideRange, 'B4');
    expect(next.band).toBe('B4');
    expect(next.repTarget).toBe(10);
  });

  it('adopts a lighter observed band and moves reps to the top of the range', () => {
    const micro = { ...defaultMicroForExercise(wideRange), band: 'B5' as const, repTarget: 10 };
    const next = reconcileMicroToObservedBand(micro, wideRange, 'B4');
    expect(next.band).toBe('B4');
    expect(next.repTarget).toBe(12);
  });

  it('clamps an observed band outside the exercise’s suggested range', () => {
    const micro = defaultMicroForExercise(wideRange); // B3
    expect(reconcileMicroToObservedBand(micro, wideRange, 'B1').band).toBe('B3');
    const heavy = { ...micro, band: 'B4' as const };
    // The user reports the heaviest band they own; the exercise tops out at B5, so that is what
    // is adopted rather than a load the library never suggests for the movement.
    expect(reconcileMicroToObservedBand(heavy, wideRange, 'B5').band).toBe('B5');
  });

  it('is a no-op for the ordinary cases: same band, no report, bodyweight work', () => {
    const micro = defaultMicroForExercise(bandedPush);
    expect(reconcileMicroToObservedBand(micro, bandedPush, micro.band)).toBe(micro);
    expect(reconcileMicroToObservedBand(micro, bandedPush, null)).toBe(micro);
    expect(reconcileMicroToObservedBand(micro, bandedPush, undefined)).toBe(micro);
    const bw = defaultMicroForExercise(bodyweightPush);
    expect(reconcileMicroToObservedBand(bw, bodyweightPush, 'B4')).toBe(bw);
  });
});

// A level's anchor can be re-pointed from a bodyweight exercise to a band one (this is what
// happened to `vertical_push.l4`, whose bodyweight anchor was hard-filtered away from most users).
// Progression state stored before such a change still carries `band: null` against an anchor that
// now has a band range. Every band-branch calculation has to read that as "the lightest band this
// exercise is authored for" — the band those users were being prescribed all along — rather than
// as "no band left to climb", which would skip the band ladder entirely.
describe('§6.2 micro-progression — a null band on a band anchor', () => {
  const nullBand = (exercise: typeof bandedPush): ProgressionMicroState => ({
    ...defaultMicroForExercise(exercise),
    band: null,
  });

  it('climbs the band ladder instead of jumping straight to a level change', () => {
    // banded-push-up is "B1-B2": maxed reps at an implied B1 must bump to B2, not level up.
    const micro = { ...nullBand(bandedPush), repTarget: 12 };
    const step = microAdvance(micro, bandedPush);
    expect(step.levelChange).toBeNull();
    expect(step.micro.band).toBe('B2');
    expect(step.micro.repTarget).toBe(10);
  });

  it('still reports the floor, so it does not drop a level early', () => {
    expect(isAtBottomMicroStep(nullBand(bandedPush), bandedPush)).toBe(true);
    expect(microRegress(nullBand(bandedPush), bandedPush).levelChange).toBe('down');
  });

  it('repairs the null to a real band when the user logs what they trained with', () => {
    const wide = library.find((e) => e.equipment === 'band' && e.band === 'B3-B5')!;
    // Observed the implied band: nothing moves, but the null is written back as B3.
    expect(reconcileMicroToObservedBand(nullBand(wide), wide, 'B3').band).toBe('B3');
    // Observed something heavier: adopted, with reps reset as on any band change.
    const heavier = reconcileMicroToObservedBand({ ...nullBand(wide), repTarget: 12 }, wide, 'B4');
    expect(heavier.band).toBe('B4');
    expect(heavier.repTarget).toBe(10);
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
