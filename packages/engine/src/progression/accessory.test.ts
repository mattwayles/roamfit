import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import {
  applyAccessorySessionResult,
  isPassedRungBandExercise,
  progressesAsAccessory,
  seedAccessoryMicro,
  seedPassedRungMicro,
} from './accessory';
import type { AccessoryPerformance, AccessoryProgressionState } from './accessory';
import { prescribeAccessory } from '../prescription/prescribe';
import type { ProgressionMicroState } from '../types';

const library = exerciseLibrary.exercises;
const curl = library.find((e) => e.id === 'single-arm-curl')!; // band, reps, "B1-B2", no family
const hold = library.find((e) => e.id === 'wall-sit-abduction')!; // band, time 30s, "B1-B2"
const bwAccessory = library.find(
  (e) =>
    e.equipment === 'bodyweight' &&
    !e.progression_family &&
    e.roles.includes('main') &&
    e.metric === 'reps' &&
    e.pattern !== 'conditioning',
)!;
const cardio = library.find((e) => e.pattern === 'conditioning' && e.equipment === 'band')!;

const MET: AccessoryPerformance = {
  allSetsMetTarget: true,
  anySetBelowTarget: false,
  difficultyFeedback: 'just_right',
};
const MISSED: AccessoryPerformance = {
  allSetsMetTarget: false,
  anySetBelowTarget: true,
  difficultyFeedback: 'just_right',
};

function state(micro: ProgressionMicroState, consecutiveMisses = 0): AccessoryProgressionState {
  return { micro, consecutiveMisses };
}

/** The medium-day difficulty-table prescription an accessory gets on its first outing. */
const MEDIUM_CURL = { repTarget: 12, tempoSec: 3, restSec: 75, sets: 3, band: 'B1' as const };

describe('accessory micro-progression', () => {
  it('cardio is not an accessory ladder; strength and bodyweight work are', () => {
    expect(progressesAsAccessory(cardio)).toBe(false);
    expect(progressesAsAccessory(curl)).toBe(true);
    expect(progressesAsAccessory(bwAccessory)).toBe(true);
  });

  describe('seedAccessoryMicro — the first outing becomes the starting rung', () => {
    it('reads the table prescription, clamped into the ladder’s ranges', () => {
      expect(seedAccessoryMicro(curl, MEDIUM_CURL)).toEqual({
        repTarget: 12,
        band: 'B1',
        tempoSec: 3,
        restSec: 45, // 75 → the ladder's 45 ceiling
        sets: 3,
      });
      // easy's 15 reps is past the top of 8-12; hard's 4 sets / tempo 4 are inside the caps.
      expect(
        seedAccessoryMicro(curl, { repTarget: 15, tempoSec: 4, restSec: 60, sets: 4, band: 'B2' }),
      ).toEqual({ repTarget: 12, band: 'B2', tempoSec: 4, restSec: 45, sets: 4 });
    });

    it('a timed accessory seeds on seconds', () => {
      const micro = seedAccessoryMicro(hold, {
        durationSec: 30,
        tempoSec: 3,
        restSec: 75,
        sets: 3,
        band: 'B1',
      });
      expect(micro.repTarget).toBe(30);
    });

    it('bodyweight carries no band', () => {
      expect(seedAccessoryMicro(bwAccessory, { ...MEDIUM_CURL }).band).toBeNull();
    });
  });

  it('the user’s report: 3x12 prescribed at B1, all done at B2, just right → B3 next time', () => {
    const seeded = seedAccessoryMicro(curl, MEDIUM_CURL);
    const result = applyAccessorySessionResult(state(seeded), curl, {
      ...MET,
      finalBand: 'B2',
      finalBandHeldThroughout: true,
    });
    // 12 reps on B2 was shown, so it stays; 12 is the top of the rep range, so the step is the
    // next band — B3, even though the curl is authored B1-B2. Bands run to B5 here.
    expect(result.state.micro).toMatchObject({ band: 'B3', repTarget: 8, tempoSec: 3 });
    expect(result.event).toEqual({ kind: 'micro_advance' });
  });

  it('a 30s hold done at B3 on a B1-B2 record comes back at B3 and 35s', () => {
    const seeded = seedAccessoryMicro(hold, {
      durationSec: 30,
      tempoSec: 3,
      restSec: 75,
      sets: 3,
      band: 'B1',
    });
    const result = applyAccessorySessionResult(state(seeded), hold, {
      ...MET,
      finalBand: 'B3',
      finalBandHeldThroughout: true,
    });
    expect(result.state.micro).toMatchObject({ band: 'B3', repTarget: 35 });
  });

  it('moving up only partway through resets reps to the bottom at the new band (family rule)', () => {
    const seeded = seedAccessoryMicro(curl, MEDIUM_CURL);
    const result = applyAccessorySessionResult(state(seeded), curl, {
      ...MET,
      finalBand: 'B2',
      finalBandHeldThroughout: false,
    });
    expect(result.state.micro).toMatchObject({ band: 'B2', repTarget: 9 });
  });

  it('climbs the family ladder: reps, then a band step', () => {
    let s = state(seedAccessoryMicro(curl, { ...MEDIUM_CURL, repTarget: 8 }));
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      s = applyAccessorySessionResult(s, curl, MET).state;
      const m = s.micro;
      seen.push(`${m.band}x${m.repTarget} t${m.tempoSec} r${m.restSec} s${m.sets}`);
    }
    expect(seen).toEqual([
      'B1x9 t3 r45 s3',
      'B1x10 t3 r45 s3',
      'B1x11 t3 r45 s3',
      'B1x12 t3 r45 s3',
      'B2x8 t3 r45 s3',
      'B2x9 t3 r45 s3',
      'B2x10 t3 r45 s3',
      'B2x11 t3 r45 s3',
    ]);
  });

  it('the authored range is no ceiling: reps → next band, all the way to B5, before any pace knob', () => {
    let s = state({ repTarget: 12, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 });
    const bands: string[] = [];
    for (let i = 0; i < 20; i++) {
      s = applyAccessorySessionResult(s, curl, MET).state;
      if (s.micro.repTarget === 8) bands.push(s.micro.band!);
      expect(s.micro).toMatchObject({ tempoSec: 3, restSec: 45, sets: 3 });
      if (s.micro.band === 'B5' && s.micro.repTarget === 12) break;
    }
    expect(bands).toEqual(['B3', 'B4', 'B5']);
    // Only at B5 x 12 does the pace start to move.
    s = applyAccessorySessionResult(s, curl, MET).state;
    expect(s.micro).toMatchObject({ band: 'B5', repTarget: 12, tempoSec: 4 });
  });

  it('on the heaviest band, or bodyweight, the top is mastery: it holds', () => {
    const top = { repTarget: 12, tempoSec: 4, restSec: 30, sets: 4 };
    const b5 = applyAccessorySessionResult(state({ ...top, band: 'B5' }), curl, MET);
    expect(b5.event).toEqual({ kind: 'mastery_pr_check' });
    expect(b5.state.micro.band).toBe('B5');
    const bw = applyAccessorySessionResult(state({ ...top, band: null }), bwAccessory, MET);
    expect(bw.event).toEqual({ kind: 'mastery_pr_check' });
  });

  it('a timed accessory climbs 5s a session', () => {
    const micro = seedAccessoryMicro(hold, {
      durationSec: 30,
      tempoSec: 3,
      restSec: 45,
      sets: 3,
      band: 'B1',
    });
    const result = applyAccessorySessionResult(state(micro), hold, MET);
    expect(result.state.micro.repTarget).toBe(35);
  });

  it('too_hard never advances, even with every set met', () => {
    const micro = seedAccessoryMicro(curl, { ...MEDIUM_CURL, repTarget: 10 });
    const result = applyAccessorySessionResult(state(micro), curl, {
      ...MET,
      difficultyFeedback: 'too_hard',
    });
    expect(result.event.kind).not.toBe('micro_advance');
    expect(result.state.micro.repTarget).toBe(10);
  });

  it('a first miss is tracked, the second regresses a step', () => {
    const micro = seedAccessoryMicro(curl, { ...MEDIUM_CURL, repTarget: 10 });
    const first = applyAccessorySessionResult(state(micro), curl, MISSED);
    expect(first.event).toEqual({ kind: 'hold' });
    expect(first.state.consecutiveMisses).toBe(1);
    const second = applyAccessorySessionResult(first.state, curl, MISSED);
    expect(second.event).toEqual({ kind: 'micro_regress' });
    expect(second.state.micro.repTarget).toBe(9);
  });

  it('regress steps a band down past the authored bottom, and holds at B1', () => {
    const bicep = library.find((e) => e.id === 'bicep-curl')!; // "B2-B3"
    const atAuthoredBottom: ProgressionMicroState = {
      repTarget: 8,
      band: 'B2',
      tempoSec: 3,
      restSec: 45,
      sets: 3,
    };
    const dropped = applyAccessorySessionResult(state(atAuthoredBottom, 1), bicep, MISSED);
    expect(dropped.event).toEqual({ kind: 'micro_regress' });
    expect(dropped.state.micro).toMatchObject({ band: 'B1', repTarget: 12 });
    // At B1 x 8 there is nothing lighter: it holds, counting the miss.
    const floor = applyAccessorySessionResult(
      state({ ...atAuthoredBottom, band: 'B1' }, 1),
      bicep,
      MISSED,
    );
    expect(floor.event).toEqual({ kind: 'hold' });
    expect(floor.state.consecutiveMisses).toBe(2);
  });

  it('just right without every set met holds where it is', () => {
    const micro = seedAccessoryMicro(curl, MEDIUM_CURL);
    const result = applyAccessorySessionResult(state(micro), curl, {
      allSetsMetTarget: false,
      anySetBelowTarget: false,
      difficultyFeedback: 'just_right',
    });
    expect(result).toEqual({ state: state(micro), event: { kind: 'hold' } });
  });
});

describe('prescribeAccessory with a ladder position', () => {
  const micro: ProgressionMicroState = {
    repTarget: 9,
    band: 'B2',
    tempoSec: 4,
    restSec: 30,
    sets: 4,
  };

  it('the micro-state is the prescription, whatever the day’s difficulty', () => {
    for (const requestedDifficulty of ['easy', 'medium', 'hard'] as const) {
      const entry = prescribeAccessory({
        exercise: curl,
        requestedDifficulty,
        recoveryTreatment: false,
        micro,
      });
      expect(entry).toMatchObject({ band: 'B2', repTarget: 9, tempoSec: 4, restSec: 30, sets: 4 });
      expect(entry.progressionFamilyId).toBeNull();
    }
  });

  it('a timed accessory gets the micro target as its hold length', () => {
    const entry = prescribeAccessory({
      exercise: hold,
      requestedDifficulty: 'medium',
      recoveryTreatment: false,
      micro: { ...micro, repTarget: 35 },
    });
    expect(entry).toMatchObject({ durationSec: 35, repTarget: undefined, band: 'B2' });
  });

  it('48h recovery still drops one band; the sets multiplier still applies', () => {
    const entry = prescribeAccessory({
      exercise: curl,
      requestedDifficulty: 'medium',
      recoveryTreatment: true,
      setsMultiplier: 0.8,
      micro,
    });
    expect(entry).toMatchObject({ band: 'B1', sets: 3 });
  });

  it('cardio ignores a micro-state and stays on the interval table', () => {
    const entry = prescribeAccessory({
      exercise: cardio,
      requestedDifficulty: 'medium',
      recoveryTreatment: false,
      micro,
    });
    expect(entry.restSec).not.toBe(30);
    expect(entry.durationSec).toBe(40);
  });
});

describe('passed-rung band exercises keep climbing past their authored range', () => {
  const vp = familyLibrary.families.find((f) => f.id === 'vertical_pull')!;
  const pulldown = library.find((e) => e.id === 'straight-arm-pulldown')!; // l2, "B1-B2"
  const latPulldown = library.find((e) => e.id === 'lat-pulldown')!; // l4, "B2-B3"
  const deadHang = library.find((e) => e.id === 'bw-dead-hang')!; // l1, bodyweight

  it('a band exercise below the current rung is passed; at or above it, or bodyweight, is not', () => {
    expect(isPassedRungBandExercise(pulldown, vp, 'vertical_pull.l4')).toBe(true);
    expect(isPassedRungBandExercise(pulldown, vp, 'vertical_pull.l2')).toBe(false);
    expect(isPassedRungBandExercise(latPulldown, vp, 'vertical_pull.l4')).toBe(false);
    expect(isPassedRungBandExercise(deadHang, vp, 'vertical_pull.l4')).toBe(false);
  });

  it('first drawn: the bottom of the next band above its authored top', () => {
    expect(seedPassedRungMicro(pulldown, null)).toEqual({
      repTarget: 8,
      band: 'B3',
      tempoSec: 3,
      restSec: 45,
      sets: 3,
    });
    // A heavier band the user already finished it on wins; a lighter one doesn't pull it down.
    expect(seedPassedRungMicro(pulldown, 'B4').band).toBe('B4');
    expect(seedPassedRungMicro(pulldown, 'B1').band).toBe('B3');
    // Never past B5.
    const b5Top = library.find((e) => e.equipment === 'band' && e.band?.endsWith('B5'))!;
    expect(seedPassedRungMicro(b5Top, null).band).toBe('B5');
  });
});
