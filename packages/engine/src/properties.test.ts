/**
 * Property tests (wave-02 brief item 10) — invariants that must hold for *every* generated
 * session, checked across a broad sweep of `(focus, effort, targetMinutes, equipmentPreference)`
 * combinations crossed with a few different user states (cold-start, an "established" user with
 * history and mixed progression levels, a user with an active limitation, a user with
 * `bodyweight_bearing` anchors enabled). The sweep is exhaustive over the request space rather
 * than randomly sampled, which for a space this size is stronger coverage than random sampling
 * and stays fully deterministic without needing its own RNG.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { Exercise, Focus, ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { calibrationStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
import type { Effort, EquipmentPreference, ProgressionState, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const byId = new Map(library.map((e) => [e.id, e]));
const TODAY = '2026-08-30';

function coldStart(overrides: Partial<UserState> = {}): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.exercise_id)!;
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
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: true,
    ...overrides,
  };
}

/** An "established" user sitting a few levels up several ladders, so laddered slots don't all
 *  resolve to the calibration-start level across every scenario. */
function establishedUser(): UserState {
  const state = coldStart();
  for (const family of families) {
    const idx = Math.min(3, family.levels.length - 1);
    const level = family.levels[idx];
    const exercise = library.find((e) => e.id === level.exercise_id)!;
    state.progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: false,
      consecutiveHits: 1,
      consecutiveMisses: 0,
      lastLevelChangeAt: '2026-08-01',
    };
  }
  return state;
}

const userStates: [string, () => UserState][] = [
  ['cold start', () => coldStart()],
  ['established', () => establishedUser()],
  [
    'shoulder limitation',
    () =>
      coldStart({
        profile: {
          units: 'lb',
          weeklyTarget: 3,
          limitations: [{ tag: 'shoulder_overhead', createdAt: '2026-01-01', source: 'user' }],
          anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
        },
      }),
  ],
  [
    'bodyweight_bearing enabled',
    () =>
      coldStart({
        profile: {
          units: 'lb',
          weeklyTarget: 3,
          limitations: [],
          anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE, 'pullup-bar', 'body-support'],
        },
      }),
  ],
];

const FOCI: Focus[] = ['upper', 'legs', 'abs', 'full'];
const EFFORTS: Effort[] = ['easy', 'normal', 'hard'];
const MINUTES = [15, 20, 30, 45, 60];
const EQUIPMENT: EquipmentPreference[] = ['any', 'band', 'bodyweight'];

const PUSH_PATTERNS = new Set(['horizontal_push', 'vertical_push']);
const PULL_PATTERNS = new Set(['horizontal_pull', 'vertical_pull']);

function exerciseFor(exerciseId: string): Exercise {
  const ex = byId.get(exerciseId);
  if (!ex) throw new Error(`golden pool inconsistency: unknown exercise id ${exerciseId}`);
  return ex;
}

describe('property: invariants hold across the full request sweep', () => {
  for (const [label, buildState] of userStates) {
    for (const focus of FOCI) {
      for (const effort of EFFORTS) {
        for (const targetMinutes of MINUTES) {
          for (const equipmentPreference of EQUIPMENT) {
            it(`${label} / ${focus} / ${effort} / ${targetMinutes}min / ${equipmentPreference}`, () => {
              const userState = buildState();
              const seed = `${label}-${focus}-${effort}-${targetMinutes}-${equipmentPreference}`;
              const plan = generateSession({
                library: exerciseLibrary,
                families: familyLibrary,
                userState,
                request: { focus, effort, targetMinutes, equipmentPreference },
                clock: { today: TODAY, tzId: 'UTC' },
                rng: createRng(hashSeed(seed)),
              });

              const allEntries = [...plan.warmup, ...plan.main, ...plan.cooldown];

              // Never a contraindicated exercise.
              const activeTags = new Set(userState.profile.limitations.map((l) => l.tag));
              for (const entry of allEntries) {
                const ex = exerciseFor(entry.exerciseId);
                for (const tag of ex.contraindications) {
                  expect(activeTags.has(tag)).toBe(false);
                }
              }

              // Never a disabled anchor.
              for (const entry of allEntries) {
                const ex = exerciseFor(entry.exerciseId);
                expect(userState.profile.anchorsAvailable).toContain(ex.anchor);
              }

              // Never `hard` effort on a bodyweight_bearing exercise, regardless of the day's effort.
              for (const entry of plan.main) {
                if (entry.anchorClass === 'bodyweight_bearing') {
                  expect(entry.effort).not.toBe('hard');
                }
              }

              // Always at least one warmup and one cooldown (the real library's pools are never
              // empty) — a full session may pick several to actually fill its §5.6-budgeted
              // warmup/cooldown minutes rather than leaving them on the table.
              expect(plan.warmup.length).toBeGreaterThanOrEqual(1);
              expect(plan.cooldown.length).toBeGreaterThanOrEqual(1);

              // No exercise repeated within the session.
              const ids = allEntries.map((e) => e.exerciseId);
              expect(new Set(ids).size).toBe(ids.length);

              // §5.6: "add or drop until within +/-10% of target." This is the real requirement
              // — not a loose sanity ceiling. `timeBudgetDeviation` is the ONLY legitimate escape
              // hatch, and only in the 'under' direction (a pool genuinely too thin to fill more
              // main work — a real content limitation). An 'over' deviation (an overrun) is NOT
              // excusable through this field at all: §1.1 names overrunning specifically as the
              // churn risk, worse than a shortfall a caller can label honestly, and the engine has
              // a sets-trim lever (applied whenever required entries alone would overshoot,
              // regardless of target length) that must have already brought it back in band. If
              // this ever fires, that is a real regression to fix, not a case to reclassify.
              expect(plan.estimatedMinutes).toBeGreaterThan(0);
              if (plan.timeBudgetDeviation) {
                // The flag itself must be internally consistent and must actually describe an
                // out-of-band case — it is not a free pass.
                expect(plan.timeBudgetDeviation.targetMinutes).toBe(targetMinutes);
                expect(plan.timeBudgetDeviation.estimatedMinutes).toBe(plan.estimatedMinutes);
                const withinBand =
                  plan.estimatedMinutes >= targetMinutes * 0.9 &&
                  plan.estimatedMinutes <= targetMinutes * 1.1;
                expect(withinBand).toBe(false);
                expect(plan.explanation).toMatch(/min/); // surfaced in the §5.8 line, not silent
                expect(plan.timeBudgetDeviation.direction).toBe('under');
                // Carried-forward issue #7: a shortfall reason must name its true cause.
                // 'thin_pool' means an optional slot the template offered had zero eligible
                // candidates; 'template_exhausted' means every offered slot filled but the
                // template's own exercise-count ceiling ran out before the budget did. Both are
                // legitimate 'under' reasons — never 'structural_minimum', which is 'over'-only.
                expect(['thin_pool', 'template_exhausted']).toContain(
                  plan.timeBudgetDeviation.reason,
                );
                expect(plan.estimatedMinutes).toBeLessThan(targetMinutes);
              } else {
                expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(targetMinutes * 0.9);
                expect(plan.estimatedMinutes).toBeLessThanOrEqual(targetMinutes * 1.1);
              }

              // Upper push/pull balance survives all the way to the final main list, not just
              // the template, when nothing forced an imbalance (a PATTERN GAP or a compressed
              // <25min template, which spec explicitly exempts).
              if (focus === 'upper' && targetMinutes >= 25 && plan.patternGaps.length === 0) {
                const pushCount = plan.main.filter((e) => PUSH_PATTERNS.has(e.pattern)).length;
                const pullCount = plan.main.filter((e) => PULL_PATTERNS.has(e.pattern)).length;
                expect(pushCount).toBe(pullCount);
              }

              // Abs is never all-flexion when nothing forced a gap.
              if (focus === 'abs' && plan.patternGaps.length === 0 && plan.main.length > 0) {
                const allFlexion = plan.main.every((e) => e.pattern === 'flexion');
                expect(allFlexion).toBe(false);
              }

              // PATTERN GAP is never silent: bodyweight-only upper/full always records one for
              // pulling (the real library has zero bodyweight pull exercises).
              if (equipmentPreference === 'bodyweight' && (focus === 'upper' || focus === 'full')) {
                const hasPullGap = plan.patternGaps.some(
                  (g) => g.pattern === 'horizontal_pull' || g.pattern === 'vertical_pull',
                );
                expect(hasPullGap).toBe(true);
              }
            });
          }
        }
      }
    }
  }
});

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
