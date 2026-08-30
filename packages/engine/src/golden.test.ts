/**
 * Golden tests (wave-02 brief item 10) — fixed seed + fixed user state → committed expected
 * session JSON, via Jest snapshots (`__snapshots__/golden.test.ts.snap`, committed to git). These
 * pin `generateSession`'s actual output so a later refactor that silently changes behavior fails
 * CI here first. If a change is deliberate, update the snapshot (`jest -u`) AND bump
 * `ENGINE_VERSION` in `version.ts` — that's what makes `engine_version` (§4.6) mean something.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession, generateQuickSession } from './pipeline';
import { createRng } from './rng';
import { calibrationStartLevel, findFamily } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
import type { ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

function coldStartUserState(overrides: Partial<UserState> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.exercise_id)!;
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: true,
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
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: false,
    ...overrides,
  };
}

describe('golden: generateSession output is pinned', () => {
  it('cold-start upper, 30min, normal, seed 1', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'America/Chicago' },
      rng: createRng(1),
    });
    expect(plan).toMatchSnapshot();
  });

  it('cold-start legs, 20min, easy, seed 2', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      request: { focus: 'legs', effort: 'easy', targetMinutes: 20 },
      clock: { today: TODAY, tzId: 'America/Chicago' },
      rng: createRng(2),
    });
    expect(plan).toMatchSnapshot();
  });

  it('mid-progression full, 45min, hard (with a finisher slot), seed 3', () => {
    const userState = coldStartUserState({ hasEverCompletedSession: true });
    // Move a couple of families off their calibration start so this fixture isn't identical in
    // shape to the cold-start ones above.
    const squatFamily = findFamily(families, 'squat')!;
    const squatLevel = squatFamily.levels[3];
    const squatExercise = library.find((e) => e.id === squatLevel.exercise_id)!;
    userState.progressionStates.squat = {
      familyId: 'squat',
      levelId: squatLevel.level_id,
      micro: defaultMicroForExercise(squatExercise),
      calibrating: false,
      consecutiveHits: 1,
      consecutiveMisses: 0,
      lastLevelChangeAt: '2026-08-15',
    };
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState,
      request: { focus: 'full', effort: 'hard', targetMinutes: 45 },
      clock: { today: TODAY, tzId: 'America/Chicago' },
      rng: createRng(3),
    });
    expect(plan).toMatchSnapshot();
  });

  it('Quick Session, upper, seed 4', () => {
    const plan = generateQuickSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      clock: { today: TODAY, tzId: 'America/Chicago' },
      rng: createRng(4),
      focus: 'upper',
    });
    expect(plan).toMatchSnapshot();
  });

  it('abs, 30min, normal — never all-flexion, seed 5', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: { focus: 'abs', effort: 'normal', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'America/Chicago' },
      rng: createRng(5),
    });
    expect(plan).toMatchSnapshot();
  });
});
