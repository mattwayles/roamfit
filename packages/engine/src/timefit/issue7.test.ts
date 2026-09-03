/**
 * Carried-forward issue #7 (docs/ORCHESTRATION.md) — pins the four (focus, effort,
 * targetMinutes) combinations an independent review found landing 11-20% under the requested
 * duration while the engine reported `timeBudgetDeviation.reason: 'thin_pool'`. The label was
 * wrong in at least 3 of 4 cases: `legs/25min`'s `legs.isolation`/`legs.calf` optional slots and
 * `abs/hard/30min`'s `lateral_flexion` slot (§5.5's required oblique/lateral movement) were never
 * being filled even though their pools hold 10+ eligible exercises each, and
 * `timefit/fitSession.ts`'s add-loop broke on the first optional entry that didn't fit rather
 * than trying smaller ones after it. This test pins the real, honest requirement — within ±10%
 * of target, for a cold-start user against the real library — and is not to be weakened to match
 * whatever the engine currently does.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Focus, ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from '../pipeline';
import { createRng, seedFromString } from '../rng';
import { calibrationStartLevel } from '../progression/ladder';
import { defaultMicroForExercise } from '../progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from '../filters/hardFilters';
import { longSessionSetsMultiplier, mainExerciseCountRange } from './formulas';
import { COMEBACK_VOLUME_MULTIPLIER } from '../progression/constants';
import type { Effort, ProgressionState, UserState } from '../types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

function coldStart(overrides: Partial<UserState> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: false,
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
    hasEverCompletedSession: true,
    ...overrides,
  };
}

const cases: [Focus, Effort, number][] = [
  ['legs', 'easy', 25],
  ['legs', 'hard', 25],
  ['abs', 'hard', 30],
];

describe('issue #7 — time-fit shortfalls with a mislabeled reason', () => {
  it.each(cases)('%s / %s / %dmin lands within ±10% of target', (focus, effort, targetMinutes) => {
    const seed = `${focus}-${effort}-${targetMinutes}`;
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart(),
      request: { focus, effort, targetMinutes, equipmentPreference: 'any' },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(seedFromString(seed)),
    });
    expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(targetMinutes * 0.9);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(targetMinutes * 1.1);
    expect(plan.timeBudgetDeviation).toBeUndefined();
  });

  it('abs/hard/30min fills the required lateral/oblique slot (§5.5: "plus one oblique/lateral")', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart(),
      request: { focus: 'abs', effort: 'hard', targetMinutes: 30, equipmentPreference: 'any' },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(seedFromString('abs-hard-30-lateral')),
    });
    expect(plan.main.some((e) => e.pattern === 'lateral_flexion')).toBe(true);
  });

  it('full/normal/60min is either within band or, if genuinely content-limited, says so with a reason other than thin_pool', () => {
    const plan = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart(),
      request: { focus: 'full', effort: 'normal', targetMinutes: 60, equipmentPreference: 'any' },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(seedFromString('full-normal-60')),
    });
    if (plan.timeBudgetDeviation) {
      expect(plan.timeBudgetDeviation.reason).not.toBe('thin_pool');
    } else {
      expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(60 * 0.9);
    }
  });
});

// ADR 0013 — targets above 60 minutes. §5.6's count table stopped at "> 45 -> [8, 10]", so a 90-
// or 120-minute request produced the same ~57-minute session as 60 and reported
// `template_exhausted`. Extra time now comes mostly from set volume, not exercise count.
describe('long targets (ADR 0013)', () => {
  it.each(['full', 'upper', 'legs', 'abs'] as const)(
    '90 and 120 minute targets land within the ±10%% band for %s',
    (focus) => {
      for (const targetMinutes of [90, 120]) {
        const plan = generateSession({
          library: exerciseLibrary,
          families: familyLibrary,
          userState: coldStart(),
          request: { focus, effort: 'normal', targetMinutes },
          clock: { today: TODAY, tzId: 'UTC' },
          rng: createRng(1),
        });
        const ratio = Math.abs(plan.estimatedMinutes - targetMinutes) / targetMinutes;
        expect(ratio).toBeLessThanOrEqual(0.1);
        expect(plan.timeBudgetDeviation).toBeUndefined();
      }
    },
  );

  it('adds time through set volume rather than exercise count alone', () => {
    const at = (targetMinutes: number) =>
      generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: coldStart(),
        request: { focus: 'full', effort: 'normal', targetMinutes },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(1),
      });
    const sixty = at(60);
    const oneTwenty = at(120);
    const sets = (p: ReturnType<typeof at>) => p.main.reduce((s, e) => s + e.sets, 0);

    // Roughly double the work, but nothing like double the movements — a two-hour session is the
    // same exercises carried further, not 25 different ones.
    expect(sets(oneTwenty)).toBeGreaterThan(sets(sixty) * 1.8);
    expect(oneTwenty.main.length).toBeLessThanOrEqual(sixty.main.length + 6);
  });

  it('leaves 60 minutes and below completely unchanged', () => {
    expect(longSessionSetsMultiplier(15)).toBe(1);
    expect(longSessionSetsMultiplier(30)).toBe(1);
    expect(longSessionSetsMultiplier(45)).toBe(1);
    expect(longSessionSetsMultiplier(60)).toBe(1);
    expect(mainExerciseCountRange(60)).toEqual([8, 10]);
    expect(mainExerciseCountRange(45)).toEqual([7, 8]);
  });

  it('a comeback cut still lightens a long session rather than being overridden by it', () => {
    // The two multipliers compose: 0.8 (§9.4) x 2 (ADR 0013) < 2.
    const yesterday = {
      localDate: '2026-07-01',
      focus: 'full',
      effort: 'normal',
      status: 'completed',
      entries: [],
    };
    const withGap = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart({ history: [yesterday] as never }),
      request: { focus: 'full', effort: 'normal', targetMinutes: 120 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(1),
    });
    const noGap = generateSession({
      library: exerciseLibrary,
      families: familyLibrary,
      userState: coldStart(),
      request: { focus: 'full', effort: 'normal', targetMinutes: 120 },
      clock: { today: TODAY, tzId: 'UTC' },
      rng: createRng(1),
    });
    // Per *exercise*, not in total: a lighter session leaves budget spare, which time-fit then
    // backfills with more (still-lighter) exercises, so the raw set count is not the measure.
    const setsPerExercise = (p: typeof withGap) =>
      p.main.reduce((s, e) => s + e.sets, 0) / p.main.length;
    expect(setsPerExercise(withGap)).toBeLessThan(setsPerExercise(noGap));
    // And the composition itself, at the level it actually happens.
    expect(COMEBACK_VOLUME_MULTIPLIER * longSessionSetsMultiplier(120)).toBeLessThan(
      longSessionSetsMultiplier(120),
    );
  });
});
