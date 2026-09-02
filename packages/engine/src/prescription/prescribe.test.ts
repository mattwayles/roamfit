import { exerciseLibrary } from '@roamfit/data';
import {
  prescribeAccessory,
  prescribeLaddered,
  prescribeWarmupCooldown,
  withOneFewerSet,
} from './prescribe';

const library = exerciseLibrary.exercises;
const bandedPush = library.find((e) => e.id === 'banded-push-up')!; // band, "B1-B2"
const bwPush = library.find((e) => e.id === 'bw-push-up')!; // bodyweight
const bwBearing = library.find((e) => e.anchor_class === 'bodyweight_bearing')!;
const warmupEx = library.find((e) => e.role === 'warmup')!;

describe('§5.4 prescription', () => {
  it('a laddered exercise is prescribed directly from ProgressionState.micro, not the effort table', () => {
    const entry = prescribeLaddered({
      exercise: bandedPush,
      familyId: 'horizontal_push',
      levelId: 'horizontal_push.l5',
      micro: { repTarget: 11, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 },
      requestedEffort: 'hard', // deliberately different from the micro state's own numbers
      recoveryTreatment: false,
    });
    expect(entry.repTarget).toBe(11);
    expect(entry.band).toBe('B2');
    expect(entry.sets).toBe(3);
    expect(entry.restSec).toBe(45);
    expect(entry.progressionFamilyId).toBe('horizontal_push');
    expect(entry.progressionLevelIdAtTime).toBe('horizontal_push.l5');
  });

  it('48h recovery drops the laddered exercise a band size and caps effort below hard', () => {
    const entry = prescribeLaddered({
      exercise: bandedPush,
      familyId: 'horizontal_push',
      levelId: 'horizontal_push.l5',
      micro: { repTarget: 11, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 },
      requestedEffort: 'hard',
      recoveryTreatment: true,
    });
    expect(entry.band).toBe('B1');
    expect(entry.effort).not.toBe('hard');
  });

  it('§13.1 caps a bodyweight_bearing laddered exercise at normal even on a hard day', () => {
    const entry = prescribeLaddered({
      exercise: bwBearing,
      familyId: 'vertical_pull',
      levelId: 'x',
      micro: { repTarget: 10, band: null, tempoSec: 3, restSec: 45, sets: 3 },
      requestedEffort: 'hard',
      recoveryTreatment: false,
    });
    expect(entry.effort).toBe('normal');
  });

  it('accessory prescription uses the §5.4 effort table', () => {
    const easy = prescribeAccessory({
      exercise: bwPush,
      requestedEffort: 'easy',
      recoveryTreatment: false,
    });
    expect(easy).toMatchObject({ sets: 3, repTarget: 15, restSec: 60, tempoSec: 3 });
    const hard = prescribeAccessory({
      exercise: bwPush,
      requestedEffort: 'hard',
      recoveryTreatment: false,
    });
    expect(hard).toMatchObject({ sets: 4, repTarget: 12, restSec: 30, tempoSec: 4 });
  });

  it('the finisher slot at hard effort is prescribed AMRAP', () => {
    const entry = prescribeAccessory({
      exercise: bwPush,
      requestedEffort: 'hard',
      recoveryTreatment: false,
      isFinisherAmrap: true,
    });
    expect(entry.repTarget).toBeUndefined();
    expect(entry.notes).toBe('AMRAP');
  });

  it('warmup/cooldown entries carry no band and no progression', () => {
    const entry = prescribeWarmupCooldown(warmupEx, 'warmup');
    expect(entry.band).toBeNull();
    expect(entry.progressionFamilyId).toBeNull();
    expect(entry.role).toBe('warmup');
  });

  describe('withOneFewerSet — precise §5.6 overrun trim (round 2)', () => {
    it('removes exactly one set and recomputes estimatedSec, not a proportional-rounded multiplier', () => {
      const entry = prescribeAccessory({
        exercise: bwPush,
        requestedEffort: 'normal',
        recoveryTreatment: false,
      });
      expect(entry.sets).toBe(3);
      const trimmed = withOneFewerSet(entry);
      expect(trimmed.sets).toBe(2);
      // A round-to-nearest-integer multiplier close to 1 (e.g. 0.9) would round 3 -> 3, a no-op —
      // this is exactly the coarseness bug the precise version exists to avoid.
      expect(trimmed.estimatedSec).toBeLessThan(entry.estimatedSec);
    });

    it('is a no-op once sets is already 1 (the floor)', () => {
      const entry = {
        ...prescribeAccessory({
          exercise: bwPush,
          requestedEffort: 'normal',
          recoveryTreatment: false,
        }),
        sets: 1,
      };
      const trimmed = withOneFewerSet(entry);
      expect(trimmed).toBe(entry);
    });

    it('recomputes a timed entry using the timed formula', () => {
      const timedEx = library.find((e) => e.metric === 'time' && e.role === 'main')!;
      const entry = prescribeAccessory({
        exercise: timedEx,
        requestedEffort: 'normal',
        recoveryTreatment: false,
      });
      const trimmed = withOneFewerSet(entry);
      expect(trimmed.sets).toBe(entry.sets - 1);
      expect(trimmed.durationSec).toBe(entry.durationSec); // duration itself is untouched, only sets
      expect(trimmed.estimatedSec).toBeLessThan(entry.estimatedSec);
    });
  });
});

// ADR 0010 — `micro.band` tracks the level's *anchor*, but any sibling at that level may be
// programmed, each with its own authored band range.
describe('§5.4 prescription — sibling band clamp (ADR 0010)', () => {
  const rdl = library.find((e) => e.id === 'rdl')!; // band, "B3-B4" — a hinge.l3 anchor
  const gluteKickback = library.find((e) => e.id === 'glute-kickback')!; // band, "B1-B2"
  const bwGluteBridge = library.find((e) => e.id === 'bw-glute-bridge')!; // bodyweight

  function prescribe(exercise: typeof rdl, band: 'B1' | 'B2' | 'B3' | 'B4' | null) {
    return prescribeLaddered({
      exercise,
      familyId: 'hinge',
      levelId: 'hinge.l3',
      micro: { repTarget: 10, band, tempoSec: 3, restSec: 45, sets: 3 },
      requestedEffort: 'normal',
      recoveryTreatment: false,
    });
  }

  it('leaves the band alone when it is already inside the exercise’s range', () => {
    expect(prescribe(rdl, 'B4').band).toBe('B4');
  });

  it('clamps down to a lighter sibling’s maximum', () => {
    // B3 is legal for the rdl anchor (B3-B4) but above glute-kickback's B1-B2 ceiling.
    expect(prescribe(gluteKickback, 'B3').band).toBe('B2');
  });

  it('clamps up to a heavier sibling’s minimum', () => {
    expect(prescribe(rdl, 'B1').band).toBe('B3');
  });

  it('gives a bodyweight sibling no band at all', () => {
    expect(prescribe(bwGluteBridge, 'B4').band).toBeNull();
  });

  it('starts a band sibling at its lightest band when the anchor is bodyweight (micro.band null)', () => {
    expect(prescribe(gluteKickback, null).band).toBe('B1');
  });

  it('applies the 48h recovery drop after the clamp, not before', () => {
    const entry = prescribeLaddered({
      exercise: gluteKickback,
      familyId: 'hinge',
      levelId: 'hinge.l3',
      micro: { repTarget: 10, band: 'B4', tempoSec: 3, restSec: 45, sets: 3 },
      requestedEffort: 'normal',
      recoveryTreatment: true,
    });
    expect(entry.band).toBe('B1'); // clamped B4 -> B2, then dropped one -> B1
  });
});
