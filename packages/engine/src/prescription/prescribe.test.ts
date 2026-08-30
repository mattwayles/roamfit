import { exerciseLibrary } from '@roamfit/data';
import { prescribeAccessory, prescribeLaddered, prescribeWarmupCooldown } from './prescribe';

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
    const easy = prescribeAccessory({ exercise: bwPush, requestedEffort: 'easy', recoveryTreatment: false });
    expect(easy).toMatchObject({ sets: 3, repTarget: 15, restSec: 60, tempoSec: 3 });
    const hard = prescribeAccessory({ exercise: bwPush, requestedEffort: 'hard', recoveryTreatment: false });
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
});
