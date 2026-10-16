import { exerciseLibrary } from '@roamfit/data';
import {
  applyAccessorySessionResult,
  progressesAsAccessory,
  seedAccessoryMicro,
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

  it('the user’s report: 3x12 prescribed at B1, all done at B2, just right → harder next time', () => {
    const seeded = seedAccessoryMicro(curl, MEDIUM_CURL);
    const result = applyAccessorySessionResult(state(seeded), curl, {
      ...MET,
      finalBand: 'B2',
      finalBandHeldThroughout: true,
    });
    // 12 reps on B2 was shown, so it stays; B2 is the top of the curl's range, so the step up is
    // the next knob — a slower tempo — not fewer reps.
    expect(result.state.micro).toMatchObject({ band: 'B2', repTarget: 12, tempoSec: 4 });
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

  it('climbs the family ladder: reps → band (in range) → tempo → rest → sets', () => {
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

  it('past the top of the ladder, the next level is the next band, from a fresh micro-state', () => {
    const top: ProgressionMicroState = {
      repTarget: 12,
      band: 'B2',
      tempoSec: 4,
      restSec: 30,
      sets: 4,
    };
    const result = applyAccessorySessionResult(state(top), curl, MET);
    expect(result.event).toEqual({ kind: 'band_up', band: 'B3' });
    expect(result.state.micro).toEqual({
      repTarget: 8,
      band: 'B3',
      tempoSec: 3,
      restSec: 45,
      sets: 3,
    });
  });

  it('above the authored range the band step is spent; it climbs pace, then the next band', () => {
    let s = state({ repTarget: 12, band: 'B3', tempoSec: 3, restSec: 45, sets: 3 });
    s = applyAccessorySessionResult(s, curl, MET).state;
    expect(s.micro).toMatchObject({ band: 'B3', tempoSec: 4 });
    s = applyAccessorySessionResult(s, curl, MET).state;
    s = applyAccessorySessionResult(s, curl, MET).state;
    expect(s.micro).toMatchObject({ band: 'B3', restSec: 30, sets: 4 });
    const result = applyAccessorySessionResult(s, curl, MET);
    expect(result.event).toEqual({ kind: 'band_up', band: 'B4' });
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

  it('two misses at the bottom drop a band, reps at the top of the range', () => {
    const bicep = library.find((e) => e.id === 'bicep-curl')!; // "B2-B3"
    const bottom: ProgressionMicroState = {
      repTarget: 8,
      band: 'B2',
      tempoSec: 3,
      restSec: 45,
      sets: 3,
    };
    const first = applyAccessorySessionResult(state(bottom, 1), bicep, MISSED);
    expect(first.event).toEqual({ kind: 'band_down', band: 'B1' });
    expect(first.state.micro).toMatchObject({ band: 'B1', repTarget: 12 });
    // At B1 there is nowhere lighter: it holds.
    const floor = applyAccessorySessionResult(state({ ...bottom, band: 'B1' }, 1), curl, MISSED);
    expect(floor.event).toEqual({ kind: 'hold' });
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
