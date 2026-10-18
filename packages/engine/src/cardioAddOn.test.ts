import { exerciseLibrary, familyLibrary, isCardioExercise } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession, generateQuickSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { FIXED_POINT_ANCHORS } from './filters/hardFilters';
import { cardioAddOnCount, interleaveEvenly } from './template/cardioAddOn';
import { isLegPrep } from './selection/warmupCooldown';
import type { ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const TODAY = '2026-08-30';

function coldStart(overrides: Partial<UserState['profile']> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of familyLibrary.families) {
    const level = baseStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return {
    profile: {
      units: 'lb',
      weeklyTarget: 3,
      limitations: [],
      anchorsAvailable: [...FIXED_POINT_ANCHORS],
      disabledExerciseIds: [],
      ...overrides,
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: false,
  };
}

function plan(
  focus: 'upper' | 'abs' | 'legs' | 'full' | 'cardio',
  cardioAddOn: boolean | undefined,
  targetMinutes = 45,
  seed = 7,
) {
  return generateSession({
    library: exerciseLibrary,
    families: familyLibrary,
    userState: coldStart(),
    request: { focus, difficulty: 'medium', targetMinutes, cardioAddOn },
    clock: { today: TODAY, tzId: 'UTC' },
    rng: createRng(seed),
  });
}

const isCardioEntry = (id: string) => isCardioExercise(library.find((e) => e.id === id)!);

describe('cardio add-on', () => {
  it.each(['upper', 'abs', 'legs', 'full'] as const)(
    '%s: weaves cardio between strength work, never leading or trailing',
    (focus) => {
      const p = plan(focus, true);
      const flags = p.main.map((e) => isCardioEntry(e.exerciseId));
      expect(flags.some(Boolean)).toBe(true);
      expect(flags.some((f) => !f)).toBe(true);
      expect(flags[0]).toBe(false);
      expect(flags[flags.length - 1]).toBe(false);
      expect(new Set(p.main.map((e) => e.exerciseId)).size).toBe(p.main.length);
    },
  );

  it.each(['upper', 'abs', 'full'] as const)(
    '%s: warm-up and cool-down each include a leg exercise (impact cardio on cold legs)',
    (focus) => {
      for (const seed of [1, 2, 3, 7, 11]) {
        const p = plan(focus, true, 45, seed);
        for (const section of [p.warmup, p.cooldown]) {
          expect(section.some((e) => isLegPrep(library.find((x) => x.id === e.exerciseId)!))).toBe(
            true,
          );
        }
      }
    },
  );

  it('adds nothing when off, and off is identical to omitting the flag', () => {
    const off = plan('full', false);
    expect(off.main.some((e) => isCardioEntry(e.exerciseId))).toBe(false);
    expect(plan('full', undefined)).toEqual(off);
  });

  it('keeps the session near its time target', () => {
    for (const minutes of [30, 45, 60]) {
      const p = plan('full', true, minutes);
      expect(Math.abs(p.estimatedMinutes - minutes)).toBeLessThanOrEqual(minutes * 0.15);
    }
  });

  it('uses the requested count of cardio moves', () => {
    const p = plan('upper', true, 60);
    expect(p.main.filter((e) => isCardioEntry(e.exerciseId)).length).toBe(cardioAddOnCount(60));
  });

  it('every add-on cardio move is a single set', () => {
    for (const focus of ['upper', 'legs', 'full'] as const) {
      const cardio = plan(focus, true, 60).main.filter((e) => isCardioEntry(e.exerciseId));
      expect(cardio.length).toBeGreaterThan(1);
      expect(cardio.every((e) => e.sets === 1)).toBe(true);
    }
  });

  it('is ignored for the Cardio focus and for Quick Session', () => {
    expect(plan('cardio', true)).toEqual(plan('cardio', false));
    const quick = generateQuickSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart(),
      focus: 'full',
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(3),
    });
    expect(quick.main.some((e) => isCardioEntry(e.exerciseId))).toBe(false);
  });

  it('never draws a cardio move the equipment/disabled filters exclude', () => {
    const cardioIds = library.filter(isCardioExercise).map((e) => e.id);
    const p = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart({ disabledExerciseIds: cardioIds }),
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 45, cardioAddOn: true },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(7),
    });
    expect(p.main.length).toBeGreaterThan(0);
    expect(p.main.some((e) => isCardioEntry(e.exerciseId))).toBe(false);
  });
});

describe('interleaveEvenly', () => {
  it('spaces cardio evenly between strength entries', () => {
    expect(interleaveEvenly(['a', 'b', 'c', 'd', 'e'], ['X', 'Y'])).toEqual([
      'a',
      'X',
      'b',
      'c',
      'Y',
      'd',
      'e',
    ]);
    expect(interleaveEvenly(['a', 'b', 'c', 'd'], ['X'])).toEqual(['a', 'b', 'X', 'c', 'd']);
  });
  it('handles empty inputs', () => {
    expect(interleaveEvenly(['a'], [])).toEqual(['a']);
    expect(interleaveEvenly([], ['X'])).toEqual(['X']);
  });
});
