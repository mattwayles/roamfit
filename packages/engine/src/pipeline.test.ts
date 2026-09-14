import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Exercise, ExerciseLibrary, ProgressionFamilyId } from '@roamfit/data';
import { generateSession, generateQuickSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
import type { ProgressionState, SessionHistoryRecord, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

/** Cold start: every family seeded at level 1. */
function coldStartUserState(overrides: Partial<UserState> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
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
        request: { focus, difficulty: 'medium', targetMinutes: 30 },
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
      // difficulty cap must have been applied to it.
      for (const entry of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
        if (entry.anchorClass !== 'bodyweight_bearing') continue;
        const exercise = exerciseLibrary.exercises.find((e) => e.id === entry.exerciseId)!;
        expect(DEFAULT_ANCHORS_AVAILABLE).toContain(exercise.anchor);
        expect(entry.difficulty).not.toBe('hard');
      }
    }
  });

  it('the first-ever session includes the first-session notice', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(1),
    });
    expect(plan.explanation).toMatch(/starting at the bottom of each ladder/);
  });

  it('generation is deterministic — same inputs, byte-identical output', () => {
    const userState = coldStartUserState();
    const run = () =>
      generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState,
        request: { focus: 'full', difficulty: 'hard', targetMinutes: 45 },
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
        disabledExerciseIds: [],
      },
    });
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState,
      request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(7),
    });
    for (const entry of plan.main) {
      const ex = library.find((e) => e.id === entry.exerciseId)!;
      expect(ex.contraindications).not.toContain('shoulder_overhead');
    }
  });

  it('§9.5 Quick Session runs the same pipeline: ~7min, normal difficulty, 1 warmup + 3 distinct main + 1 cooldown, all pinned to 1 set', () => {
    const plan = generateQuickSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState(),
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(3),
      focus: 'upper',
    });
    expect(plan.difficulty).toBe('medium');
    expect(plan.targetMinutes).toBe(7);
    expect(plan.main.length).toBe(3);
    expect(new Set(plan.main.map((e) => e.exerciseId)).size).toBe(3);
    expect(plan.warmup.length).toBe(1);
    expect(plan.cooldown.length).toBe(1);
    for (const entry of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
      expect(entry.sets).toBe(1);
    }
  });

  it('§9.4 comeback: a 10-day gap shows the welcome-back notice and cuts volume', () => {
    const withGap = coldStartUserState({
      hasEverCompletedSession: true,
      history: [
        {
          localDate: '2026-08-19', // 11 days before TODAY
          focus: 'upper',
          difficulty: 'medium',
          status: 'completed',
          entries: [{ exerciseId: 'bw-push-up', role: 'main', difficulty: 'medium', sets: 3 }],
        },
      ],
    });
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: withGap,
      request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
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
        difficulty: 'medium',
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 10 },
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 15 },
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
        request: {
          focus: 'legs',
          difficulty: 'medium',
          targetMinutes,
          equipmentPreference: 'band',
        },
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

  // Track 14 — main-pool scoping (belt-and-braces, since no non-cardio template asks for the
  // `conditioning` pattern anyway; this confirms it structurally, not just by omission).
  it('never programs a conditioning-pattern exercise into MAIN work for a non-cardio focus', () => {
    for (const focus of ['upper', 'legs', 'abs', 'full'] as const) {
      const plan = generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: coldStartUserState({ hasEverCompletedSession: true }),
        request: { focus, difficulty: 'medium', targetMinutes: 30 },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(21),
      });
      expect(plan.main.every((e) => e.pattern !== 'conditioning')).toBe(true);
    }
  });

  it('every cardio MAIN entry is conditioning-pattern', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: { focus: 'cardio', difficulty: 'medium', targetMinutes: 30 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(21),
    });
    expect(plan.main.length).toBeGreaterThan(0);
    expect(plan.main.every((e) => e.pattern === 'conditioning')).toBe(true);
  });

  it('a cardio move may still open a strength session as a warm-up (scoping is MAIN-only)', () => {
    // bw-jumping-jack carries focus ['cardio', 'full'] with a warmup role (increment 2's tag
    // audit) specifically so a 'full' session's warm-up pool isn't scoped away from it. Whether
    // any *one* seed draws it is an RNG matter — sweep several to show the pool genuinely offers
    // it, rather than pinning one lucky seed.
    let sawConditioningWarmup = false;
    for (let seed = 0; seed < 20 && !sawConditioningWarmup; seed++) {
      const plan = generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: coldStartUserState({ hasEverCompletedSession: true }),
        request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(seed),
      });
      if (plan.warmup.some((e) => e.pattern === 'conditioning')) sawConditioningWarmup = true;
    }
    expect(sawConditioningWarmup).toBe(true);
  });

  it('completes a full 200-exercise generation in well under 50ms', () => {
    const userState = coldStartUserState();
    const start = performance.now();
    generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState,
      request: { focus: 'full', difficulty: 'hard', targetMinutes: 60 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(11),
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // Track 14 — the full-body finisher slot is dropped for good (user decision). A hard/45min
  // session used to be exactly the case that added one; confirm no slot or entry ever appears.
  it('a hard, 45min full session has no finisher slot or entry', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStartUserState({ hasEverCompletedSession: true }),
      request: { focus: 'full', difficulty: 'hard', targetMinutes: 45 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(3),
    });
    expect(plan.main.some((e) => e.notes === 'AMRAP')).toBe(false);
    // 5 required full-body slots max out at 8 (§5.6's [7,8] range for 45min) — 3 appended
    // accessory slots at most, none of them a finisher (there is no such slot type left to add).
    expect(plan.main.length).toBeLessThanOrEqual(8);
  });
});

/**
 * Track 14 — the real library has only 10 conditioning exercises today (increment 4 adds ~30
 * more). That's thin enough that a 60+ minute cardio session, or two back-to-back ones, can
 * legitimately run out of eligible content — which is a real (temporary) library limitation, not
 * something these tests should be tuned around. A synthetic ~40-exercise fixture pool exercises
 * the *pipeline's* cardio time-fit and recency logic on their own terms, independent of today's
 * thin real pool. `cardioMainExerciseCountRange`'s numbers were tuned against this fixture, not
 * the real 10.
 *
 * Built by replacing the real library's conditioning records with synthetic ones and keeping
 * everything else (warmup/cooldown drills, stretches, every strength exercise) — this exercises
 * real hard-filter/warmup/cooldown/progression-state behavior around a merely-bigger cardio pool,
 * rather than a library that only knows about cardio.
 */
function buildCardioFixtureLibrary(count = 40): ExerciseLibrary {
  const nonCardio = exerciseLibrary.exercises.filter((e) => e.pattern !== 'conditioning');
  const muscles = [
    'quads',
    'calves',
    'hip_flexors',
    'glutes',
    'abs',
    'hamstrings',
    'chest',
    'lats',
  ];
  const difficulties = ['easy', 'medium', 'hard'] as const;
  const synthetic: Exercise[] = Array.from({ length: count }, (_, i) => {
    const isBand = i % 4 === 0;
    const equipment = isBand ? 'band' : 'bodyweight';
    return {
      id: `fixture-cardio-${i}`,
      name: `Fixture Cardio ${i}`,
      aliases: [],
      focus: ['cardio'],
      pattern: 'conditioning',
      primary: [muscles[i % muscles.length]],
      secondary: [],
      equipment,
      band: isBand ? 'B1-B2' : null,
      anchor: isBand ? 'anchor-low' : 'none',
      anchor_alt: null,
      anchor_class: isBand ? 'band_tension' : 'none',
      unilateral: false,
      metric: 'time',
      default_seconds: 30,
      tier: 'fill',
      roles: ['main'],
      difficulty: difficulties[i % 3],
      progression_family: null,
      progression_level_id: null,
      // Every 5th fixture is impact-heavy, matching the real library's jump/hop-style records.
      contraindications: i % 5 === 0 ? ['knee_impact'] : [],
      setup: 'Fixture cardio movement for engine tests.',
      video_search: 'https://example.com',
    };
  });
  // One jump-rope-anchored record — gear-gated (Track 14): must never appear unless the user has
  // ticked the anchor. anchor_class 'none' (nothing to bear or tension against), equipment
  // 'bodyweight' — matches the plan's real jump-rope records.
  const jumpRope: Exercise = {
    id: 'fixture-jump-rope',
    name: 'Fixture Jump Rope',
    aliases: [],
    focus: ['cardio'],
    pattern: 'conditioning',
    primary: ['calves'],
    secondary: [],
    equipment: 'bodyweight',
    band: null,
    anchor: 'jump-rope',
    anchor_alt: null,
    anchor_class: 'none',
    unilateral: false,
    metric: 'time',
    default_seconds: 30,
    tier: 'fill',
    roles: ['main'],
    difficulty: 'medium',
    progression_family: null,
    progression_level_id: null,
    contraindications: ['knee_impact', 'ankle'],
    setup: 'Fixture jump-rope movement for engine tests.',
    video_search: 'https://example.com',
  };
  return { exercises: [...nonCardio, ...synthetic, jumpRope] };
}

describe('Track 14 — cardio focus, ~40-exercise fixture library', () => {
  const fixtureLibrary = buildCardioFixtureLibrary();

  function cardioUserState(overrides: Partial<UserState> = {}): UserState {
    return coldStartUserState({
      profile: {
        units: 'lb',
        weeklyTarget: 3,
        limitations: [],
        anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
        disabledExerciseIds: [],
      },
      hasEverCompletedSession: true,
      ...overrides,
    });
  }

  // §5.6: "add or drop until within ±10% of target," with `timeBudgetDeviation` as the only
  // legitimate (and always-named) escape hatch — same requirement the general property sweep
  // checks, exercised here specifically at the lengths the plan calls out.
  it.each([15, 30, 60, 120])(
    'cardio at %imin lands within ±10%% or reports a deviation',
    (minutes) => {
      const plan = generateSession({
        library: fixtureLibrary,
        families: familyLibrary,
        userState: cardioUserState(),
        request: { focus: 'cardio', difficulty: 'medium', targetMinutes: minutes },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(minutes),
      });
      expect(plan.main.length).toBeGreaterThan(0);
      expect(plan.main.every((e) => e.pattern === 'conditioning')).toBe(true);
      if (plan.timeBudgetDeviation) {
        expect(plan.timeBudgetDeviation.direction).toBe('under');
        expect(plan.explanation).toMatch(/min/);
      } else {
        expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(plan.targetMinutes * 0.9);
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(plan.targetMinutes * 1.1);
      }
    },
  );

  // Recency (BLOCKED, 2 sessions) is the main risk of running out of content on a thin pool —
  // this proves the fixture pool (and the pipeline's fallback levers) still fill under the
  // hardest simultaneous stack: two prior cardio sessions just used a chunk of it, plus
  // bodyweight-only, plus a knee_impact limitation, plus easy (the narrowest difficulty tier).
  it('back-to-back cardio sessions still fill under bodyweight-only / knee_impact / easy', () => {
    const priorEntries = (sessionIndex: number) =>
      Array.from({ length: 4 }, (_, i) => ({
        exerciseId: `fixture-cardio-${(sessionIndex * 4 + i) % 40}`,
        role: 'main' as const,
        difficulty: 'easy' as const,
      }));
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-26',
        focus: 'cardio',
        difficulty: 'easy',
        status: 'completed',
        entries: priorEntries(0),
      },
      {
        localDate: '2026-08-28',
        focus: 'cardio',
        difficulty: 'easy',
        status: 'completed',
        entries: priorEntries(1),
      },
    ];
    const userState = cardioUserState({
      history,
      profile: {
        units: 'lb',
        weeklyTarget: 3,
        limitations: [{ tag: 'knee_impact', createdAt: '2026-01-01', source: 'user' }],
        anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
        disabledExerciseIds: [],
      },
    });
    const plan = generateSession({
      library: fixtureLibrary,
      families: familyLibrary,
      userState,
      request: {
        focus: 'cardio',
        difficulty: 'easy',
        targetMinutes: 30,
        equipmentPreference: 'bodyweight',
      },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(30),
    });
    expect(plan.main.length).toBeGreaterThan(0);
    for (const e of plan.main) {
      expect(e.pattern).toBe('conditioning');
      const ex = fixtureLibrary.exercises.find((x) => x.id === e.exerciseId)!;
      expect(ex.contraindications).not.toContain('knee_impact');
      expect(ex.equipment).toBe('bodyweight');
    }
    // BLOCKED (2-session cooldown) must actually have been respected, not incidentally avoided.
    const blockedIds = new Set([...priorEntries(1)].map((e) => e.exerciseId));
    expect(plan.main.some((e) => blockedIds.has(e.exerciseId))).toBe(false);
  });

  describe('jump rope gating', () => {
    it('never appears in any role without the jump-rope anchor, across many seeds', () => {
      for (let seed = 0; seed < 25; seed++) {
        const plan = generateSession({
          library: fixtureLibrary,
          families: familyLibrary,
          userState: cardioUserState(), // DEFAULT_ANCHORS_AVAILABLE has no 'jump-rope'
          request: { focus: 'cardio', difficulty: 'medium', targetMinutes: 60 },
          clock: { today: TODAY, tzId: 'UTC' },
          rng: createRng(seed),
        });
        const allIds = [...plan.warmup, ...plan.main, ...plan.cooldown].map((e) => e.exerciseId);
        expect(allIds).not.toContain('fixture-jump-rope');
      }
    });

    it('can appear once the jump-rope anchor is available', () => {
      let seenJumpRope = false;
      for (let seed = 0; seed < 25 && !seenJumpRope; seed++) {
        const plan = generateSession({
          library: fixtureLibrary,
          families: familyLibrary,
          userState: cardioUserState({
            profile: {
              units: 'lb',
              weeklyTarget: 3,
              limitations: [],
              anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE, 'jump-rope'],
              disabledExerciseIds: [],
            },
          }),
          request: { focus: 'cardio', difficulty: 'medium', targetMinutes: 60 },
          clock: { today: TODAY, tzId: 'UTC' },
          rng: createRng(seed),
        });
        if (plan.main.some((e) => e.exerciseId === 'fixture-jump-rope')) seenJumpRope = true;
      }
      expect(seenJumpRope).toBe(true);
    });
  });
});
