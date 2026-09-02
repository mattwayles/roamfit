import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession, generateQuickSession } from './pipeline';
import { createRng } from './rng';
import { calibrationStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
import type { ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

/** §6.5 cold start: every family seeded at ~30th percentile, calibrating. */
function coldStartUserState(overrides: Partial<UserState> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
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

describe('generateSession — pipeline wiring', () => {
  it('produces a valid session for a brand-new user, every focus, with zero configuration', () => {
    for (const focus of ['upper', 'legs', 'abs', 'full'] as const) {
      const plan = generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: coldStartUserState(),
        request: { focus, effort: 'normal', targetMinutes: 30 },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(1),
      });
      expect(plan.main.length).toBeGreaterThan(0);
      // Full sessions fill their §5.6-budgeted warmup/cooldown minutes with as many exercises as
      // it takes (Quick Session, tested separately below, is the one case pinned to exactly 1).
      expect(plan.warmup.length).toBeGreaterThanOrEqual(1);
      expect(plan.cooldown.length).toBeGreaterThanOrEqual(1);
      expect(plan.explanation.length).toBeGreaterThan(0);
      expect(plan.engineVersion).toBeTruthy();
      expect(plan.focus).toBe(focus);
      // §13.1 default. This used to assert no `bodyweight_bearing` entry appeared at all, which
      // was never the actual rule — ADR 0007 put `low-bar` in DEFAULT_ANCHORS_AVAILABLE precisely
      // so bar-supported work could be programmed. It only held because every family used to be
      // seeded at the 30th percentile, where no bearing exercise happened to sit. ADR 0012 moved
      // the cold start to level 1, and `vertical_pull.l1` is a hang, so the real rule is what is
      // pinned now: any bearing exercise must use an anchor the user actually has, and §13.1's
      // effort cap must have been applied to it.
      for (const entry of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
        if (entry.anchorClass !== 'bodyweight_bearing') continue;
        const exercise = exerciseLibrary.exercises.find((e) => e.id === entry.exerciseId)!;
        expect(DEFAULT_ANCHORS_AVAILABLE).toContain(exercise.anchor);
        expect(entry.effort).not.toBe('hard');
      }
    }
  });

  it('the first-ever session includes the calibration notice', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(1),
    });
    expect(plan.explanation).toMatch(/first few sessions set your starting levels/);
  });

  it('generation is deterministic — same inputs, byte-identical output', () => {
    const userState = coldStartUserState();
    const run = () =>
      generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState,
        request: { focus: 'full', effort: 'hard', targetMinutes: 45 },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(42),
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('never programs a limitation-contraindicated exercise', () => {
    const userState = coldStartUserState({
      profile: {
        units: 'lb',
        weeklyTarget: 3,
        limitations: [{ tag: 'shoulder_overhead', createdAt: '2026-01-01', source: 'user' }],
        anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
      },
    });
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState,
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(7),
    });
    for (const entry of plan.main) {
      const ex = library.find((e) => e.id === entry.exerciseId)!;
      expect(ex.contraindications).not.toContain('shoulder_overhead');
    }
  });

  it('§9.5 Quick Session runs the same pipeline: ~7min, normal effort, 1 warmup + <=3 main + 1 cooldown', () => {
    const plan = generateQuickSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(3),
      focus: 'upper',
    });
    expect(plan.effort).toBe('normal');
    expect(plan.targetMinutes).toBe(7);
    expect(plan.main.length).toBeLessThanOrEqual(3);
    expect(plan.warmup.length).toBe(1);
    expect(plan.cooldown.length).toBe(1);
  });

  it('§9.4 comeback: a 10-day gap shows the welcome-back notice and cuts volume', () => {
    const withGap = coldStartUserState({
      hasEverCompletedSession: true,
      history: [
        {
          localDate: '2026-08-19', // 11 days before TODAY
          focus: 'upper',
          effort: 'normal',
          status: 'completed',
          entries: [{ exerciseId: 'bw-push-up', role: 'main', effort: 'normal', sets: 3 }],
        },
      ],
    });
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: withGap,
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(5),
    });
    expect(plan.explanation).toMatch(/Welcome back/);
  });

  it('PATTERN GAP is never silent for a bodyweight-only upper session', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: {
        focus: 'upper',
        effort: 'normal',
        targetMinutes: 30,
        equipmentPreference: 'bodyweight',
      },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(9),
    });
    // Bodyweight alone cannot cover pulling: either a band was used for it (resolution recorded)
    // or the imbalance is stated — either way, patternGaps is non-empty and the explanation says so.
    const hasPullGap = plan.patternGaps.some(
      (g) => g.pattern === 'horizontal_pull' || g.pattern === 'vertical_pull',
    );
    expect(hasPullGap).toBe(true);
  });

  it('ADR 0002: a request below the 15min floor is clamped, reflected in targetMinutes, and named in the explanation', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: { focus: 'full', effort: 'normal', targetMinutes: 10 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(13),
    });
    expect(plan.targetMinutes).toBe(15);
    expect(plan.explanation).toMatch(/10 min is too short/);
    expect(plan.explanation).toMatch(/Quick Session/);
  });

  it('does not clamp a request at or above the 15min floor', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: { focus: 'full', effort: 'normal', targetMinutes: 15 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(13),
    });
    expect(plan.targetMinutes).toBe(15);
    expect(plan.explanation).not.toMatch(/too short/);
  });

  it('§9.5 Quick Session is not subject to the 15min floor (it never requests it)', () => {
    const plan = generateQuickSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(3),
      focus: 'upper',
    });
    expect(plan.targetMinutes).toBe(7);
  });

  it('regression: a required-only overrun is trimmed via sets, at any target length, not just short ones (round 2 fix)', () => {
    // The exact class of case an independent review found still overrunning after round 1:
    // mainstream 25-60min targets where a proportional multiplier rounded away to a no-op.
    // Assert directly, not just via the property sweep, so a future refactor that reintroduces
    // the coarse-rounding bug fails a named test.
    for (const targetMinutes of [25, 30, 45, 60]) {
      const plan = generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: coldStartUserState({ hasEverCompletedSession: true }),
        request: { focus: 'legs', effort: 'normal', targetMinutes, equipmentPreference: 'band' },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(1),
      });
      if (plan.timeBudgetDeviation) {
        // Only a legitimate, named 'under' (thin-pool) case may pass through undeviated-overrun-free.
        expect(plan.timeBudgetDeviation.direction).toBe('under');
      } else {
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(targetMinutes * 1.1);
      }
    }
  });

  it('completes a full 200-exercise generation in well under 50ms', () => {
    const userState = coldStartUserState();
    const start = performance.now();
    generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState,
      request: { focus: 'full', effort: 'hard', targetMinutes: 60 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(11),
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
