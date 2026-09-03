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
const warmupEx = library.find((e) => e.roles.includes('warmup'))!;

describe('§5.4 prescription', () => {
  it('a laddered exercise is prescribed directly from ProgressionState.micro, not the difficulty table', () => {
    const entry = prescribeLaddered({
      exercise: bandedPush,
      familyId: 'horizontal_push',
      levelId: 'horizontal_push.l5',
      micro: { repTarget: 11, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 },
      requestedDifficulty: 'hard', // deliberately different from the micro state's own numbers
      recoveryTreatment: false,
    });
    expect(entry.repTarget).toBe(11);
    expect(entry.band).toBe('B2');
    expect(entry.sets).toBe(3);
    expect(entry.restSec).toBe(45);
    expect(entry.progressionFamilyId).toBe('horizontal_push');
    expect(entry.progressionLevelIdAtTime).toBe('horizontal_push.l5');
  });

  it('48h recovery drops the laddered exercise a band size and caps difficulty below hard', () => {
    const entry = prescribeLaddered({
      exercise: bandedPush,
      familyId: 'horizontal_push',
      levelId: 'horizontal_push.l5',
      micro: { repTarget: 11, band: 'B2', tempoSec: 3, restSec: 45, sets: 3 },
      requestedDifficulty: 'hard',
      recoveryTreatment: true,
    });
    expect(entry.band).toBe('B1');
    expect(entry.difficulty).not.toBe('hard');
  });

  it('§13.1 caps a bodyweight_bearing laddered exercise at normal even on a hard day', () => {
    const entry = prescribeLaddered({
      exercise: bwBearing,
      familyId: 'vertical_pull',
      levelId: 'x',
      micro: { repTarget: 10, band: null, tempoSec: 3, restSec: 45, sets: 3 },
      requestedDifficulty: 'hard',
      recoveryTreatment: false,
    });
    expect(entry.difficulty).toBe('medium');
  });

  it('accessory prescription uses the §5.4 difficulty table', () => {
    const easy = prescribeAccessory({
      exercise: bwPush,
      requestedDifficulty: 'easy',
      recoveryTreatment: false,
    });
    expect(easy).toMatchObject({ sets: 3, repTarget: 15, restSec: 60, tempoSec: 3 });
    const hard = prescribeAccessory({
      exercise: bwPush,
      requestedDifficulty: 'hard',
      recoveryTreatment: false,
    });
    expect(hard).toMatchObject({ sets: 4, repTarget: 12, restSec: 30, tempoSec: 4 });
  });

  it('the finisher slot at hard difficulty is prescribed AMRAP', () => {
    const entry = prescribeAccessory({
      exercise: bwPush,
      requestedDifficulty: 'hard',
      recoveryTreatment: false,
      isFinisherAmrap: true,
    });
    expect(entry.repTarget).toBeUndefined();
    expect(entry.notes).toBe('AMRAP');
  });

  it('warmup/cooldown entries carry no progression, whatever the exercise is', () => {
    const entry = prescribeWarmupCooldown(warmupEx, 'warmup');
    expect(entry.progressionFamilyId).toBeNull();
    expect(entry.progressionLevelIdAtTime).toBeNull();
    expect(entry.role).toBe('warmup');
  });

  describe('the same exercise, warmed up rather than trained', () => {
    it("is one set of light reps with no rest — not the difficulty table's working dose", () => {
      const asMain = prescribeAccessory({
        exercise: bandedPush,
        requestedDifficulty: 'medium',
        recoveryTreatment: false,
      });
      const asWarmup = prescribeWarmupCooldown(bandedPush, 'warmup');

      expect(asWarmup.sets).toBe(1);
      expect(asWarmup.sets).toBeLessThan(asMain.sets);
      expect(asWarmup.restSec).toBe(0);
      expect(asWarmup.estimatedSec).toBeLessThan(asMain.estimatedSec);
    });

    it('gives a band exercise its lightest band, never nothing at all', () => {
      // A band row warmed up with no band is a different movement. bandedPush is authored "B1-B2".
      expect(prescribeWarmupCooldown(bandedPush, 'warmup').band).toBe('B1');
    });

    it('leaves a bodyweight exercise bandless', () => {
      expect(prescribeWarmupCooldown(bwPush, 'warmup').band).toBeNull();
    });

    it('caps a hold used as a warm-up, but takes a stretch at its authored length', () => {
      const longHold = library.find(
        (e) => e.metric === 'time' && (e.default_seconds ?? 0) > 45 && e.roles.includes('main'),
      );
      if (longHold) {
        expect(prescribeWarmupCooldown(longHold, 'warmup').durationSec).toBe(45);
      }
      const stretch = library.find((e) => e.roles.includes('cooldown') && e.metric === 'time')!;
      expect(prescribeWarmupCooldown(stretch, 'cooldown').durationSec).toBe(
        stretch.default_seconds,
      );
    });
  });

  describe('withOneFewerSet — precise §5.6 overrun trim (round 2)', () => {
    it('removes exactly one set and recomputes estimatedSec, not a proportional-rounded multiplier', () => {
      const entry = prescribeAccessory({
        exercise: bwPush,
        requestedDifficulty: 'medium',
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
          requestedDifficulty: 'medium',
          recoveryTreatment: false,
        }),
        sets: 1,
      };
      const trimmed = withOneFewerSet(entry);
      expect(trimmed).toBe(entry);
    });

    it('recomputes a timed entry using the timed formula', () => {
      const timedEx = library.find((e) => e.metric === 'time' && e.roles.includes('main'))!;
      const entry = prescribeAccessory({
        exercise: timedEx,
        requestedDifficulty: 'medium',
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
      requestedDifficulty: 'medium',
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
      requestedDifficulty: 'medium',
      recoveryTreatment: true,
    });
    expect(entry.band).toBe('B1'); // clamped B4 -> B2, then dropped one -> B1
  });
});
