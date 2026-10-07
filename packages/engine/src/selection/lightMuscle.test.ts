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
  focusForMuscle,
  lightestMuscles,
  musclesForFocus,
  recommendFocus,
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

describe('recommendFocus', () => {
  it('is null with no training in the last 7 days', () => {
    expect(recommendFocus([], library, TODAY)).toBeNull();
  });

  it('names the lightest muscle and the focus that trains it', () => {
    const rec = recommendFocus(weekWithout('biceps'), library, TODAY);
    expect(rec).toEqual({ muscle: 'biceps', sets: 0, focus: 'upper' });
  });

  it('only ever recommends a user-selectable strength focus', () => {
    for (const muscle of candidateMuscles(library).keys()) {
      expect(['upper', 'abs', 'legs', 'full']).toContain(focusForMuscle(muscle, library));
    }
  });

  it('ignores abandoned sessions (ADR 0011)', () => {
    const week = weekWithout('biceps').map((s) => ({ ...s, status: 'discarded' as const }));
    expect(recommendFocus(week, library, TODAY)).toBeNull();
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
