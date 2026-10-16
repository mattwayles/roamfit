import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Focus, ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from '../pipeline';
import { createRng } from '../rng';
import { baseStartLevel } from '../progression/ladder';
import { defaultMicroForExercise } from '../progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from '../filters/hardFilters';
import type { LoggedSet, ProgressionState, SessionHistoryRecord, UserState } from '../types';
import {
  candidateMuscles,
  areaForMuscle,
  lightestMuscles,
  musclesForFocus,
  recommendFocus,
  weeklyAreaVolume,
  weightedSetCredit,
} from './lightMuscle';

const library = exerciseLibrary.exercises;
const TODAY = '2026-08-30';
const YESTERDAY = '2026-08-29';

function coldStart(history: SessionHistoryRecord[] = []): UserState {
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
      anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
      disabledExerciseIds: [],
    },
    exerciseStates: {},
    progressionStates,
    history,
    hasEverCompletedSession: history.length > 0,
  };
}

/** A week in which every candidate muscle except `skip` got four sets, and `skip` got none
 *  (not even as a secondary). */
function weekWithout(skip: string): SessionHistoryRecord[] {
  const entries = [];
  for (const muscle of candidateMuscles(library).keys()) {
    if (muscle === skip) continue;
    const ex = library.find(
      (e) =>
        e.pattern !== 'conditioning' &&
        e.primary.includes(muscle) &&
        !e.primary.includes(skip) &&
        !e.secondary.includes(skip),
    );
    if (ex)
      entries.push({
        exerciseId: ex.id,
        role: 'main' as const,
        difficulty: 'medium' as const,
        sets: 4,
      });
  }
  return [
    { localDate: YESTERDAY, focus: 'full', difficulty: 'medium', status: 'completed', entries },
  ];
}

function generate(focus: Focus, history: SessionHistoryRecord[], seed: number, minutes = 45) {
  return generateSession({
    library: exerciseLibrary,
    families: familyLibrary,
    userState: coldStart(history),
    request: { focus, difficulty: 'medium', targetMinutes: minutes },
    clock: { today: TODAY, tzId: 'UTC' },
    rng: createRng(seed),
  });
}

const primaryOf = (id: string) => library.find((e) => e.id === id)!.primary;

/** One completed session whose main work is `sets` sets of each given exercise. */
function session(ids: string[], sets: number, localDate = YESTERDAY): SessionHistoryRecord {
  return {
    localDate,
    focus: 'full',
    difficulty: 'medium',
    status: 'completed',
    entries: ids.map((exerciseId) => ({ exerciseId, role: 'main', difficulty: 'medium', sets })),
  };
}
const UPPER = 'standing-chest-press';
const CORE = 'bw-flutter-kick';
const LEGS = 'bw-squat';
const CARDIO = library.find((e) => e.pattern === 'conditioning')!.id;

describe('recommendFocus', () => {
  it('areaForMuscle maps muscles onto upper / abs / legs', () => {
    expect(areaForMuscle('biceps', library)).toBe('upper');
    expect(areaForMuscle('obliques', library)).toBe('abs');
    expect(areaForMuscle('glutes', library)).toBe('legs');
  });

  it('is full body with no history at all', () => {
    expect(recommendFocus([], library, TODAY)).toEqual({
      focus: 'full',
      sets: 0,
      reason: 'no_strength_data',
    });
  });

  it('is full body when the week held only cardio, or only abandoned strength', () => {
    expect(recommendFocus([session([CARDIO], 3)], library, TODAY).focus).toBe('full');
    const abandoned = { ...session([UPPER, LEGS], 3), status: 'discarded' as const };
    expect(recommendFocus([abandoned], library, TODAY).reason).toBe('no_strength_data');
  });

  it('ignores training older than the 7-day window', () => {
    const old = session([UPPER, CORE, LEGS, CARDIO], 3, '2026-08-10');
    expect(recommendFocus([old], library, TODAY).reason).toBe('no_strength_data');
  });

  it('recommends the area with the lowest total volume, cardio included', () => {
    const cardio = session([CARDIO], 20); // plenty, so cardio is never the lightest here
    const upper = session([UPPER], 3);
    const core = session([CORE], 3);
    const legs = session([LEGS], 3);
    const rec = (...week: SessionHistoryRecord[]) => recommendFocus(week, library, TODAY);
    expect(rec(upper, upper, core, core, cardio)).toMatchObject({
      focus: 'legs',
      reason: 'lightest',
    });
    expect(rec(legs, legs, core, core, cardio).focus).toBe('upper');
    expect(rec(upper, upper, legs, legs, cardio).focus).toBe('abs');
    expect(rec(upper, upper, core, core, legs, legs)).toMatchObject({ focus: 'cardio', sets: 0 });
  });

  it('sums every muscle in an area, so one light muscle does not decide it', () => {
    // Heavy upper work (biceps untouched) vs a single set of legs: legs is the lighter area.
    const week = [
      session([UPPER, 'banded-lat-pull-hold', 'overhead-press'], 4),
      session([LEGS, CORE, CARDIO], 4),
    ];
    const volume = weeklyAreaVolume(week, library, TODAY);
    expect(volume.upper).toBeGreaterThan(volume.legs);
    expect(recommendFocus(week, library, TODAY).focus).not.toBe('upper');
  });

  it('counts a cardio exercise to cardio only, not to the muscles it moves', () => {
    const volume = weeklyAreaVolume([session([CARDIO], 3)], library, TODAY);
    expect(volume).toEqual({ upper: 0, abs: 0, legs: 0, cardio: 3 });
  });
});

describe('Recommended Focus weights logged sets by reps and band', () => {
  const exercise = (id: string) => library.find((e) => e.id === id)!;
  const set = (
    reps: number | null,
    band: LoggedSet['band'] = null,
    seconds: number | null = null,
  ) => ({ reps, seconds, band }) as LoggedSet;
  /** One completed session of `id`, planned at `planned` sets, with these sets actually logged. */
  const logged = (id: string, planned: number, sets: LoggedSet[]): SessionHistoryRecord => ({
    ...session([id], planned),
    entries: [
      { exerciseId: id, role: 'main', difficulty: 'medium', sets: planned, loggedSets: sets },
    ],
  });
  const times = (n: number, s: LoggedSet) => Array.from({ length: n }, () => s);

  it('a typical set (10 reps at the bottom of its band range) counts 1', () => {
    expect(exercise(UPPER).band).toBe('B2-B3');
    expect(weightedSetCredit(set(10, 'B2'), exercise(UPPER))).toBe(1);
    expect(weightedSetCredit(set(10), exercise(LEGS))).toBe(1); // bodyweight: reps only
  });

  it('scales with reps, and holds with per-side seconds against 30s', () => {
    expect(weightedSetCredit(set(15), exercise(LEGS))).toBeCloseTo(1.5);
    expect(weightedSetCredit(set(5), exercise(LEGS))).toBeCloseTo(0.5);
    expect(weightedSetCredit(set(null, 'B1', 45), exercise('banded-lat-pull-hold'))).toBeCloseTo(
      1.5,
    );
  });

  it('scales by 1.25 per band step from the bottom of the exercise’s own range', () => {
    expect(weightedSetCredit(set(10, 'B3'), exercise(UPPER))).toBeCloseTo(1.25);
    expect(weightedSetCredit(set(10, 'B5'), exercise(UPPER))).toBeCloseTo(1.25 ** 3);
    expect(weightedSetCredit(set(10, 'B1'), exercise(UPPER))).toBeCloseTo(0.8);
  });

  it('caps one set at 3, so a mis-typed rep count cannot decide the week', () => {
    expect(weightedSetCredit(set(100, 'B5'), exercise(UPPER))).toBe(3);
  });

  it('a planned set that was never done counts nothing', () => {
    expect(weeklyAreaVolume([logged(LEGS, 4, [])], library, TODAY).legs).toBe(0);
    const half = weeklyAreaVolume([logged(LEGS, 4, times(2, set(10)))], library, TODAY);
    const planned = weeklyAreaVolume([session([LEGS], 2)], library, TODAY);
    expect(half.legs).toBeCloseTo(planned.legs);
  });

  it('heavier, longer sets count more than the same number of light short ones', () => {
    const heavy = weeklyAreaVolume([logged(UPPER, 3, times(3, set(12, 'B3')))], library, TODAY);
    const planned = weeklyAreaVolume([session([UPPER], 3)], library, TODAY);
    expect(heavy.upper).toBeCloseTo(planned.upper * 1.2 * 1.25);
  });

  it('cardio counts its completed sets, unweighted', () => {
    const volume = weeklyAreaVolume(
      [logged(CARDIO, 4, times(2, set(null, null, 40)))],
      library,
      TODAY,
    );
    expect(volume.cardio).toBe(2);
  });

  it('a short, light session no longer counts like a long one with the same set count', () => {
    const upper = logged(UPPER, 3, times(3, set(10, 'B2')));
    const core = logged(CORE, 3, times(3, set(10)));
    const cardio = session([CARDIO], 20);
    const legsFull = logged(LEGS, 3, times(3, set(10)));
    const legsShort = logged(LEGS, 3, times(3, set(3)));
    const rec = (...week: SessionHistoryRecord[]) => recommendFocus(week, library, TODAY).focus;
    // Planned-set counting would score both legs weeks the same.
    const rest = [upper, upper, core, core, cardio];
    expect(rec(...rest, legsFull, legsFull, legsFull)).not.toBe('legs');
    expect(rec(...rest, legsShort, legsShort, legsShort)).toBe('legs');
  });
});

describe('generation leans on the lightest muscle of the week', () => {
  const history = weekWithout('biceps');

  it('biceps is the lightest upper-body muscle in the fixture', () => {
    const ranked = lightestMuscles(history, library, TODAY, musclesForFocus('upper', library));
    expect(ranked[0].muscle).toBe('biceps');
  });

  it.each(['upper', 'full'] as const)(
    '%s: includes a biceps exercise, across seeds and lengths',
    (focus) => {
      const misses: string[] = [];
      // Under ~25 min the budget fits 2-3 exercises, all required ladder slots — no room to add.
      for (const minutes of [30, 45, 60, 90]) {
        for (const seed of [1, 2, 3, 4, 5]) {
          const p = generate(focus, history, seed, minutes);
          if (!p.main.some((e) => primaryOf(e.exerciseId).includes('biceps'))) {
            misses.push(
              `${minutes}min seed ${seed}: ${p.main.map((e) => e.exerciseId).join(', ')}`,
            );
          }
        }
      }
      expect(misses).toEqual([]);
    },
  );

  it('has no signal when the only training was before the 7-day window', () => {
    const old = [{ ...weekWithout('biceps')[0], localDate: '2026-08-10' }];
    expect(lightestMuscles(old, library, TODAY, musclesForFocus('upper', library))).toEqual([]);
  });
});
