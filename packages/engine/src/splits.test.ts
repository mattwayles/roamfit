/**
 * Track 37j — Push and Pull. A split session's main work is the upper exercises on its side of the
 * body (by pattern, shoulder isolation by muscle), covering both its laddered patterns; it warms up
 * and cools down like an upper session, at every supported length.
 */
import { exerciseLibrary, familyLibrary, suitsFocus } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { FIXED_POINT_ANCHORS } from './filters/hardFilters';
import { buildFocusTemplate } from './template/focusTemplate';
import type { ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const byId = new Map(library.map((e) => [e.id, e]));

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
      weeklyTarget: 3,
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

const SIDES = {
  push: {
    ladders: ['horizontal_push', 'vertical_push'],
    wrongSide: ['horizontal_pull', 'vertical_pull', 'elbow_flexion'],
  },
  pull: {
    ladders: ['horizontal_pull', 'vertical_pull'],
    wrongSide: ['horizontal_push', 'vertical_push', 'elbow_extension'],
  },
} as const;

describe.each(['push', 'pull'] as const)('%s', (focus) => {
  it.each([15, 30, 45, 60, 90])(
    '%i min: main work all on its side, both ladders, warm-up and cool-down',
    (minutes) => {
      for (const seed of [1, 2, 3]) {
        const plan = generateSession({
          library: exerciseLibrary,
          families: familyLibrary,
          userState: userState(),
          request: { focus, difficulty: 'medium', targetMinutes: minutes },
          clock: { today: '2026-10-18', tzId: 'UTC' },
          rng: createRng(seed),
        });
        expect(plan.focus).toBe(focus);
        // 15 minutes holds two main exercises after warm-up and cool-down, as Legs does.
        expect(plan.main.length).toBeGreaterThanOrEqual(minutes <= 15 ? 2 : 3);
        for (const e of plan.main) {
          const ex = byId.get(e.exerciseId)!;
          expect({ id: ex.id, suits: suitsFocus(ex, focus) }).toEqual({ id: ex.id, suits: true });
          expect(SIDES[focus].wrongSide).not.toContain(ex.pattern);
        }
        const patterns = new Set(plan.main.map((e) => e.pattern));
        if (minutes >= 30) for (const p of SIDES[focus].ladders) expect(patterns).toContain(p);
        expect(plan.warmup.length).toBeGreaterThan(0);
        expect(plan.cooldown.length).toBeGreaterThan(0);
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(Math.ceil(minutes * 1.1));
      }
    },
  );

  it('shoulder isolation slots are narrowed to that side’s delts', () => {
    const template = buildFocusTemplate({
      focus,
      targetMinutes: 45,
      difficulty: 'medium',
      library,
      history: [],
    });
    const delt = template.slots.find((s) => s.patterns.includes('shoulder_isolation'))!;
    expect(delt.primaryAny).toBeDefined();
    for (const e of library.filter(
      (x) => x.pattern === 'shoulder_isolation' && x.roles.includes('main'),
    )) {
      const fits = e.primary.some((m) => delt.primaryAny!.includes(m));
      expect(fits).toBe(suitsFocus(e, focus));
    }
  });
});

it('a lateral raise is a push exercise and a reverse fly a pull one', () => {
  expect(suitsFocus(byId.get('lateral-raise')!, 'push')).toBe(true);
  expect(suitsFocus(byId.get('lateral-raise')!, 'pull')).toBe(false);
  expect(suitsFocus(byId.get('reverse-fly')!, 'pull')).toBe(true);
  expect(suitsFocus(byId.get('bw-squat')!, 'push')).toBe(false);
});
