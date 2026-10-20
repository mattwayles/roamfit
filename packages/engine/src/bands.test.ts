/**
 * Track 37i — owned bands and stacking. Absent settings must reproduce the engine before 37i (every
 * other suite runs without them); owning fewer bands must never prescribe one the user lacks, and a
 * ladder must step over a band they don't own rather than stall on it; stacking must open steps
 * above B5 only when asked for and only with both bands owned.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel } from './progression/ladder';
import { defaultMicroForExercise, microAdvance, microRegress } from './progression/micro';
import { applyAccessorySessionResult } from './progression/accessory';
import { FIXED_POINT_ANCHORS } from './filters/hardFilters';
import { alternativesForSlot } from './selection/swap';
import {
  BAND_ORDER,
  DEFAULT_BAND_SETTINGS,
  SINGLE_BANDS,
  bandParts,
  clampToUsableBand,
  usableBands,
} from './types';
import type { BandSettings, ProgressionMicroState, ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const byId = new Map(library.map((e) => [e.id, e]));
const TODAY = '2026-10-18';

function userState(bands?: BandSettings): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of familyLibrary.families) {
    const level = baseStartLevel(family);
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(byId.get(level.anchor_exercise_id)!),
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return {
    profile: {
      units: 'lb',
      limitations: [],
      anchorsAvailable: [...FIXED_POINT_ANCHORS],
      disabledExerciseIds: [],
      bands,
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: false,
  };
}

const generate = (bands?: BandSettings, focus: 'upper' | 'legs' | 'full' = 'full', seed = 3) =>
  generateSession({
    library: exerciseLibrary,
    families: familyLibrary,
    userState: userState(bands),
    request: { focus, difficulty: 'medium', targetMinutes: 45 },
    clock: { today: TODAY, tzId: 'UTC' },
    rng: createRng(seed),
  });

describe('usable bands', () => {
  it('default to the five singles; stacking adds pairs only with both bands owned', () => {
    expect(usableBands(undefined)).toEqual(SINGLE_BANDS);
    expect(usableBands({ ...DEFAULT_BAND_SETTINGS, stacking: true })).toEqual(BAND_ORDER);
    expect(usableBands({ owned: ['B2', 'B5'], stacking: true })).toEqual(['B2', 'B5', 'B5+B2']);
    expect(usableBands({ owned: ['B1', 'B2', 'B3'], stacking: true })).toEqual(['B1', 'B2', 'B3']);
    expect(bandParts('B5+B3')).toEqual(['B5', 'B3']);
  });

  it('clamp to the nearest usable band below, else the lightest above', () => {
    const usable = usableBands({ owned: ['B2', 'B4'], stacking: false });
    expect(clampToUsableBand('B3', usable)).toBe('B2');
    expect(clampToUsableBand('B5', usable)).toBe('B4');
    expect(clampToUsableBand('B1', usable)).toBe('B2');
    expect(clampToUsableBand('B4', usable)).toBe('B4');
    expect(clampToUsableBand(null, usable)).toBeNull();
    expect(clampToUsableBand('B5+B2', usable)).toBe('B4');
  });
});

describe('generation', () => {
  it('no settings is the same plan as owning everything without stacking', () => {
    expect(generate(DEFAULT_BAND_SETTINGS)).toEqual(generate(undefined));
  });

  it('never hands the user a band they do not own', () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const focus of ['upper', 'legs', 'full'] as const) {
        const plan = generate({ owned: ['B2', 'B4'], stacking: false }, focus, seed);
        for (const e of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
          if (e.band) expect(['B2', 'B4']).toContain(e.band);
        }
      }
    }
  });

  it('owning no bands leaves out band exercises entirely, and still builds a workout', () => {
    const plan = generate({ owned: [], stacking: false });
    expect(plan.main.length).toBeGreaterThanOrEqual(3);
    for (const e of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
      expect(byId.get(e.exerciseId)!.equipment).toBe('bodyweight');
    }
  });
});

describe('progression over owned bands', () => {
  const squat = byId.get('deadlift')!; // authored B3-B5
  const at = (band: ProgressionMicroState['band'], repTarget = 12): ProgressionMicroState => ({
    ...defaultMicroForExercise(squat),
    band,
    repTarget,
  });

  it('steps over a band the user does not own, up and down', () => {
    const usable = usableBands({ owned: ['B3', 'B5'], stacking: false });
    const [lo, hi] = squat.band!.split('-');
    expect(BAND_ORDER.indexOf(hi as never) - BAND_ORDER.indexOf(lo as never)).toBeGreaterThan(1);
    const up = microAdvance(at(lo as never), squat, usable);
    expect(up.micro.band).not.toBe(BAND_ORDER[BAND_ORDER.indexOf(lo as never) + 1]);
    expect(usable).toContain(up.micro.band);
    const down = microRegress(at(up.micro.band, 8), squat, usable);
    expect(usable).toContain(down.micro.band);
  });

  it('with no usable band left in range, a ladder moves on to pace instead of stalling', () => {
    const top = squat.band!.split('-')[1] as never;
    const step = microAdvance(at(top), squat, ['B1']);
    expect(step.micro.band).toBe(top);
    expect(step.micro.tempoSec).toBeGreaterThan(at(top).tempoSec);
  });

  it('an accessory climbs past B5 into stacked pairs only with stacking on', () => {
    const curl = byId.get('bicep-curl')!;
    const perf = {
      allSetsMetTarget: true,
      anySetBelowTarget: false,
      difficultyFeedback: 'just_right' as const,
    };
    const atB5 = {
      micro: { ...defaultMicroForExercise(curl), band: 'B5' as const, repTarget: 12 },
      consecutiveMisses: 0,
    };
    const plain = applyAccessorySessionResult(atB5, curl, perf, 1, usableBands(undefined));
    expect(plain.state.micro.band).toBe('B5');
    const stacked = applyAccessorySessionResult(
      atB5,
      curl,
      perf,
      1,
      usableBands({ ...DEFAULT_BAND_SETTINGS, stacking: true }),
    );
    expect(stacked.state.micro.band).toBe('B5+B1');
    expect(stacked.state.micro.repTarget).toBeLessThan(12);
  });
});

describe('swap', () => {
  it('offers only exercises and bands the user can do', () => {
    const plan = generate({ owned: ['B3'], stacking: false }, 'upper');
    const entry = plan.main.find((e) => e.band)!;
    const alternatives = alternativesForSlot({
      library,
      entry,
      anchorsAvailable: [...FIXED_POINT_ANCHORS],
      limitations: [],
      disabledExerciseIds: [],
      today: TODAY,
      history: [],
      exerciseStates: {},
      bands: { owned: ['B3'], stacking: false },
    });
    for (const a of alternatives) {
      if (a.replacement.band) expect(a.replacement.band).toBe('B3');
    }
    const none = alternativesForSlot({
      library,
      entry,
      anchorsAvailable: [...FIXED_POINT_ANCHORS],
      limitations: [],
      disabledExerciseIds: [],
      today: TODAY,
      history: [],
      exerciseStates: {},
      bands: { owned: [], stacking: false },
    });
    expect(none.every((a) => a.exercise.equipment === 'bodyweight')).toBe(true);
  });
});
