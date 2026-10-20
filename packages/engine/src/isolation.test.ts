/**
 * Track 37l — the added isolation exercises are reachable: across ordinary seeds and lengths, each
 * new pattern and each new record turns up in generated sessions of its focus.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { FIXED_POINT_ANCHORS } from './filters/hardFilters';
import { addDays } from './dates';
import type { ProgressionState, SessionHistoryRecord, UserState } from './types';

const byId = new Map(exerciseLibrary.exercises.map((e) => [e.id, e]));

function userState(): UserState {
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
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: false,
  };
}

/** A user rotating Upper / Legs / Core / Full over many sessions (easy and medium days), history
 *  and exercise state carried forward, so the variety and over-worked rules act as they do for a
 *  real user. (A legs-only run never shows quad isolation: quads are over-worked every week.) */
function seen(): Set<string> {
  const ids = new Set<string>();
  let state = userState();
  let today = '2026-10-01';
  const FOCI = ['upper', 'legs', 'abs', 'full'] as const;
  for (let session = 0; session < 80; session++) {
    const focus = FOCI[session % FOCI.length];
    const difficulty = session % 2 === 0 ? 'easy' : 'medium';
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: state,
      request: { focus, difficulty, targetMinutes: 60 },
      clock: { today, tzId: 'UTC' },
      rng: createRng(session + 1),
    });
    const entries = [...plan.warmup, ...plan.main, ...plan.cooldown];
    for (const e of entries) ids.add(e.exerciseId);
    const exerciseStates = { ...state.exerciseStates };
    for (const e of entries) {
      const prev = exerciseStates[e.exerciseId];
      exerciseStates[e.exerciseId] = {
        exerciseId: e.exerciseId,
        lastPerformedAt: today,
        sessionsPerformed: (prev?.sessionsPerformed ?? 0) + 1,
        bestSet: null,
        difficultyEma: 0,
        skipCount: 0,
        swapAwayCount: 0,
        removeAtApprovalCount: 0,
        pinnedNote: null,
        suppressedUntil: null,
        disabledAt: null,
      };
    }
    const record: SessionHistoryRecord = {
      localDate: today,
      focus,
      difficulty: plan.difficulty,
      status: 'completed',
      entries: entries.map((e) => ({
        exerciseId: e.exerciseId,
        role: e.role,
        difficulty: e.difficulty,
        sets: e.sets,
      })),
    };
    state = {
      ...state,
      exerciseStates,
      history: [...state.history, record],
      hasEverCompletedSession: true,
    };
    today = addDays(today, 1);
  }
  return ids;
}

describe('track 37l isolation exercises', () => {
  const all = seen();

  it.each([
    ['upper', 'banded-concentration-curl'],
    ['upper', 'banded-drag-curl'],
    ['upper', 'banded-single-arm-pushdown'],
    ['upper', 'bw-wall-triceps-extension'],
    ['upper', 'banded-w-pull'],
    ['legs', 'bw-bent-knee-calf-raise'],
    ['legs', 'banded-seated-calf-raise'],
    ['legs', 'bw-tibialis-raise'],
    ['legs', 'banded-standing-hamstring-curl'],
    ['legs', 'banded-seated-leg-extension'],
    ['legs', 'banded-standing-adduction'],
    ['legs', 'bw-side-lying-adduction'],
  ] as const)('%s sessions can include %s', (focus, id) => {
    expect(byId.get(id)).toBeDefined();
    expect(byId.get(id)!.focus).toContain(focus);
    expect(all.has(id)).toBe(true);
  });
});
