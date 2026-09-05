import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Exercise, ProgressionFamilyId } from '@roamfit/data';
import { bandStepsFor, projectMicroToExercise, spendTier, tierCapFor, tierOf } from './tiers';
import { defaultMicroForExercise } from './micro';
import { applySessionResult } from './rules';
import { prescribeLaddered } from '../prescription/prescribe';
import type { ProgressionState, SessionEntry } from '../types';

const library = exerciseLibrary.exercises;
const byId = (id: string) => library.find((e) => e.id === id)!;

const chestPress = byId('standing-chest-press'); // band B2-B3, at a BODYWEIGHT-anchored rung
const wallPushUp = byId('bw-wall-push-up'); // the horizontal_push.l1 anchor
const bwDip = byId('bw-dip'); // bodyweight, at a BAND-anchored rung
const pushPress = byId('banded-push-press'); // band B2-B3, the vertical_push.l4 anchor

describe('tier arithmetic', () => {
  it('counts band headroom, not band presence', () => {
    expect(bandStepsFor(chestPress)).toBe(1); // B2-B3
    expect(bandStepsFor(byId('frog-pump'))).toBe(0); // "B2" — a band, but nowhere to climb
    expect(bandStepsFor(byId('assisted-pull-up'))).toBe(2); // B3-B5
    expect(bandStepsFor(wallPushUp)).toBe(0); // bodyweight
  });

  it('every exercise gets the three pace tiers on top of its band headroom', () => {
    expect(tierCapFor(wallPushUp)).toBe(3);
    expect(tierCapFor(chestPress)).toBe(4);
    expect(tierCapFor(byId('assisted-pull-up'))).toBe(5);
  });

  it('spends a tier on band size first, then tempo, rest, sets', () => {
    const at = (t: number) => spendTier(t, chestPress);
    expect(at(0)).toEqual({ band: 'B2', tempoSec: 3, restSec: 45, sets: 3 });
    expect(at(1)).toEqual({ band: 'B3', tempoSec: 3, restSec: 45, sets: 3 });
    expect(at(2)).toEqual({ band: 'B3', tempoSec: 4, restSec: 45, sets: 3 });
    expect(at(3)).toEqual({ band: 'B3', tempoSec: 4, restSec: 30, sets: 3 });
    expect(at(4)).toEqual({ band: 'B3', tempoSec: 4, restSec: 30, sets: 4 });
  });

  it('saturates rather than wrapping when an exercise runs out of knobs', () => {
    // A band-anchored rung's top tier handed to a bodyweight sibling (cap 3) has nowhere left.
    expect(spendTier(5, wallPushUp)).toEqual(spendTier(3, wallPushUp));
  });

  it('tierOf is the inverse of spendTier for every tier an exercise can express', () => {
    for (const exercise of [wallPushUp, chestPress, byId('assisted-pull-up')]) {
      for (let t = 0; t <= tierCapFor(exercise); t += 1) {
        expect(tierOf({ repTarget: 8, ...spendTier(t, exercise) }, exercise)).toBe(t);
      }
    }
  });
});

describe('projectMicroToExercise — the same ladder position on a different sibling', () => {
  it('carries repTarget through untouched: it is the knob both classes share', () => {
    const micro = { ...defaultMicroForExercise(wallPushUp), repTarget: 11 };
    expect(projectMicroToExercise(micro, wallPushUp, chestPress).repTarget).toBe(11);
  });

  it('reads a bodyweight anchor’s pace tiers as band steps on a band sibling', () => {
    const base = defaultMicroForExercise(wallPushUp);
    expect(projectMicroToExercise(base, wallPushUp, chestPress).band).toBe('B2');
    const oneTier = { ...base, tempoSec: 4 };
    expect(projectMicroToExercise(oneTier, wallPushUp, chestPress).band).toBe('B3');
  });

  it('reads a band anchor’s band steps as pace tiers on a bodyweight sibling', () => {
    const base = defaultMicroForExercise(pushPress); // B2
    expect(projectMicroToExercise(base, pushPress, bwDip).tempoSec).toBe(3);
    const oneTier = { ...base, band: 'B3' as const };
    expect(projectMicroToExercise(oneTier, pushPress, bwDip).tempoSec).toBe(4);
  });
});

// ---------------------------------------------------------------------------------------------
// The two bugs this exists to fix, driven end to end through the real ladder.
// ---------------------------------------------------------------------------------------------

function climb(familyId: ProgressionFamilyId, levelId: string, exerciseId: string, sessions: number) {
  const family = familyLibrary.families.find((f) => f.id === familyId)!;
  const anchor = byId(family.levels.find((l) => l.level_id === levelId)!.anchor_exercise_id);
  const exercise = byId(exerciseId);
  let state: ProgressionState = {
    familyId,
    levelId,
    micro: defaultMicroForExercise(anchor),
    consecutiveHits: 0,
    consecutiveMisses: 0,
    calibrating: false,
    lastLevelChangeAt: null,
  };
  const prescriptions: SessionEntry[] = [];
  for (let i = 0; i < sessions; i += 1) {
    if (state.levelId !== levelId) break; // left the rung
    prescriptions.push(
      prescribeLaddered({
        exercise,
        anchorExercise: anchor,
        familyId,
        levelId: state.levelId,
        micro: state.micro,
        requestedDifficulty: 'medium',
        recoveryTreatment: false,
      }),
    );
    state = applySessionResult(state, family, library, {
      familyId,
      allSetsMetTarget: true,
      anySetBelowTarget: false,
      difficultyFeedback: 'just_right',
    }).state;
  }
  return prescriptions;
}

describe('a band sibling at a bodyweight-anchored rung is no longer frozen', () => {
  it('Banded Standing Chest Press reaches the top of its authored B2-B3 range', () => {
    const bands = climb('horizontal_push', 'horizontal_push.l1', 'standing-chest-press', 12).map(
      (p) => p.band,
    );
    expect(bands[0]).toBe('B2');
    // Before the tier projection this was B2 for every session of the rung, and B3 was
    // unreachable for this exercise no matter how many qualifying sessions were logged.
    expect(bands).toContain('B3');
  });
});

describe('a bodyweight sibling at a band-anchored rung never silently loses reps', () => {
  it('every rep-target drop is accompanied by a visible change to another knob', () => {
    const shown = climb('vertical_push', 'vertical_push.l4', 'bw-dip', 16);
    const visible = (p: SessionEntry) => `${p.band}/${p.tempoSec}/${p.restSec}/${p.sets}`;
    for (let i = 1; i < shown.length; i += 1) {
      const prev = shown[i - 1];
      const now = shown[i];
      if ((now.repTarget ?? 0) < (prev.repTarget ?? 0)) {
        // The old behavior showed reps 12 -> 8 with band, tempo, rest and sets all identical:
        // an unexplained demotion caused by a band step the exercise could not express.
        expect(visible(now)).not.toBe(visible(prev));
      }
    }
  });
});

describe('the anchor still decides how long a rung is', () => {
  it('a sibling with different knobs does not change the number of qualifying sessions', () => {
    const asAnchor = climb('vertical_push', 'vertical_push.l4', 'banded-push-press', 40).length;
    const asSibling = climb('vertical_push', 'vertical_push.l4', 'bw-dip', 40).length;
    expect(asSibling).toBe(asAnchor);
  });
});

// Guards the assumption the whole projection rests on: a level's siblings can differ in the knobs
// they have, so nothing may assume the anchor's equipment is the programmed exercise's.
it('mixed-equipment levels are a real shape in the library, not a hypothetical', () => {
  const mixed = familyLibrary.families.flatMap((f) =>
    f.levels.filter((l) => {
      const sibs = l.exercise_ids.map(byId).filter(Boolean) as Exercise[];
      return new Set(sibs.map((s) => s.equipment)).size > 1;
    }),
  );
  expect(mixed.length).toBeGreaterThan(0);
});
