import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { ladderPosition } from './ladderPosition';
import type { PerformedSession } from './ladderPosition';
import { findFamily } from './ladder';

const library = exerciseLibrary.exercises;
const push = findFamily(familyLibrary.families, 'horizontal_push')!;
const plank = findFamily(familyLibrary.families, 'anti_extension')!;
const hang = findFamily(familyLibrary.families, 'vertical_pull')!;

// horizontal_push: l1-l4 are bodyweight rungs of 8 steps each (4 reps, tempo, rest, sets, level-up);
// l5 is banded-push-up B1-B2 (13 steps); l6-l9 bodyweight again (8 each).
const L5_FLOOR = 4 * 8;
const L6_FLOOR = L5_FLOOR + 13;

const base: PerformedSession = {
  bestReps: 8,
  bestSeconds: null,
  band: null,
  tempoSec: 3,
  restSec: 45,
  setsCompleted: 3,
};
const at = (levelId: string | null, over: Partial<PerformedSession>, fam = push) =>
  ladderPosition(fam, levelId, { ...base, ...over }, library);

describe('ladderPosition', () => {
  it('puts the bottom of the first rung at 0', () => {
    expect(at('horizontal_push.l1', {})?.position).toBe(0);
  });

  it('counts reps one step each within a rung and echoes the stable level id and ordinal', () => {
    const p = at('horizontal_push.l1', { bestReps: 11 })!;
    expect(p).toMatchObject({
      position: 3,
      stepsInRung: 3,
      levelId: 'horizontal_push.l1',
      rung: 1,
      rungLength: 8,
    });
  });

  it('a band step-up with fewer reps ranks HIGHER than more reps on the lighter band', () => {
    const lighter = at('horizontal_push.l5', { bestReps: 12, band: 'B1' })!;
    const heavier = at('horizontal_push.l5', { bestReps: 8, band: 'B2' })!;
    expect(lighter.position).toBe(L5_FLOOR + 4);
    expect(heavier.position).toBe(L5_FLOOR + 5);
    expect(heavier.position).toBeGreaterThan(lighter.position);
  });

  it('sums the whole length of every rung below (a rung change continues the climb)', () => {
    expect(at('horizontal_push.l2', {})?.position).toBe(8);
    expect(at('horizontal_push.l5', { band: 'B1' })?.position).toBe(L5_FLOOR);
    expect(at('horizontal_push.l6', {})?.position).toBe(L6_FLOOR);
    // Top of rung 5 is one step short of rung 6's floor: the level-up step belongs to rung 6.
    const top = at('horizontal_push.l5', {
      bestReps: 12,
      band: 'B2',
      tempoSec: 4,
      restSec: 30,
      setsCompleted: 4,
    })!;
    expect(top.position).toBe(L6_FLOOR - 1);
  });

  it('counts tempo, then rest, then sets as further steps after reps (and band)', () => {
    const bw = (over: Partial<PerformedSession>) => at('horizontal_push.l1', over)!.position;
    expect(bw({ bestReps: 12 })).toBe(4);
    expect(bw({ bestReps: 12, tempoSec: 4 })).toBe(5);
    expect(bw({ bestReps: 12, tempoSec: 4, restSec: 30 })).toBe(6);
    expect(bw({ bestReps: 12, tempoSec: 4, restSec: 30, setsCompleted: 4 })).toBe(7);
  });

  it('a pace knob taken early is credited only up to the last step fully reached (ladder order)', () => {
    // Tempo +1 at 8 reps: the ladder grants tempo only after 12 reps, so the reps steps count
    // (the state is "past" them) but the tempo step itself does not.
    expect(at('horizontal_push.l1', { bestReps: 8, tempoSec: 4 })?.position).toBe(4);
  });

  it('never subtracts for being below a floor: skipped set, longer rest, faster tempo, fewer reps', () => {
    expect(
      at('horizontal_push.l1', { bestReps: 3, tempoSec: 2, restSec: 90, setsCompleted: 1 })
        ?.position,
    ).toBe(0);
    // A skipped set on an otherwise heavier-band session keeps the band credit.
    expect(at('horizontal_push.l5', { band: 'B2', bestReps: 8, setsCompleted: 2 })?.position).toBe(
      L5_FLOOR + 5,
    );
  });

  it('clamps above the caps to what the ladder would credit', () => {
    // 30 reps at a bodyweight rung = the cap (12), not 30 steps.
    expect(at('horizontal_push.l1', { bestReps: 30 })?.position).toBe(4);
    // B5 on a B1-B2 anchor is credited as B2; sets past the cap as the cap.
    const heavy = at('horizontal_push.l5', {
      bestReps: 12,
      band: 'B5',
      tempoSec: 9,
      restSec: 5,
      setsCompleted: 9,
    })!;
    expect(heavy.position).toBe(L6_FLOOR - 1);
  });

  it('a null band on a band anchor is the lightest authored band', () => {
    expect(at('horizontal_push.l5', { band: null, bestReps: 10 })?.position).toBe(L5_FLOOR + 2);
  });

  it('ignores the band at a bodyweight-anchored rung (mirrors the engine: its ladder has no band)', () => {
    expect(at('horizontal_push.l2', { band: 'B3', bestReps: 10 })?.position).toBe(8 + 2);
  });

  it('places a time-metric exercise on seconds', () => {
    const hold = at('vertical_pull.l1', { bestReps: null, bestSeconds: 25 }, hang)!;
    expect(hold.position).toBe(5);
    // Reps are not seconds: a reps-only entry on a timed anchor cannot be placed.
    expect(at('vertical_pull.l1', { bestReps: 12, bestSeconds: null }, hang)).toBeNull();
  });

  it('time-metric band exercise still steps band then pace (banded plank)', () => {
    const plankL4 = at(
      'anti_extension.l4',
      { bestReps: null, bestSeconds: 20, band: 'B1' },
      plank,
    )!;
    const plankB2 = at(
      'anti_extension.l4',
      { bestReps: null, bestSeconds: 20, band: 'B2' },
      plank,
    )!;
    expect(plankB2.position).toBe(plankL4.position + 26);
  });

  it('the mastery rung is open-ended: credited within it, nothing above', () => {
    const top = at('horizontal_push.l9', {
      bestReps: 12,
      tempoSec: 4,
      restSec: 30,
      setsCompleted: 4,
    })!;
    // l1-l4 (4 x 8) + l5 (13) + l6-l8 (3 x 8) = 69 below the mastery rung.
    expect(top.position).toBe(69 + 7);
    expect(top.rung).toBe(9);
    expect(top.stepsInRung).toBe(7);
  });

  it('cannot place a session with an unknown/null level id or no measured set (a gap)', () => {
    expect(at(null, {})).toBeNull();
    expect(at('horizontal_push.l99', {})).toBeNull();
    expect(at('squat.l1', {})).toBeNull(); // another family's id is not this family's rung
    expect(at('horizontal_push.l1', { bestReps: null })).toBeNull();
  });
});
