import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Focus, ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from '../pipeline';
import { createRng } from '../rng';
import { baseStartLevel } from '../progression/ladder';
import { defaultMicroForExercise } from '../progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from '../filters/hardFilters';
import type { ProgressionState, SessionHistoryRecord, UserState } from '../types';
import {
  candidateMuscles,
  areaForMuscle,
  lightestMuscles,
  musclesForFocus,
  recommendFocus,
  weeklyAreaVolume,
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
