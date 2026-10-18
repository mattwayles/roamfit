/**
 * §5.1 step 3 / §5.2 — selection for `role: main` slots. Applies, per slot in template
 * priority order, then re-checks as whole-session aggregates:
 *
 *   BLOCKED (never) → suppressed/REPEATEDLY-SKIPPED (never, while active) → OVER-WORKED muscles
 *   never as primary mover, ≤1 exercise touching one at all → 48h recovery muscles ≤1 exercise →
 *   UNTRAINED/LOW prioritized → novelty preferred → PATTERN GAP handling for an unfillable
 *   required slot → aggregate passes: ≥1 novelty, ≥70% PREFERRED, ≥50% band.
 *
 * Resolution order when these can't all be satisfied on a thin pool (recorded in
 * STATUS-2-engine.md as a judgment call, not stated in spec.md): hard filters and BLOCKED first
 * (never relaxed) → PATTERN GAP avoidance (a band exception for an otherwise-empty pull slot) →
 * band ratio → PREFERRED ratio → novelty is opportunistic throughout, not a final override,
 * since forcing it late can undo an already-satisfied aggregate.
 *
 * Difficulty gates this file's pool before anything else does: `selectMain` narrows `pool` and
 * `poolIgnoringEquipment` to the requested difficulty's eligible tiers (`isDifficultyEligible` in
 * `hardFilters.ts`) before building candidates, so every candidate scored below already
 * qualifies. This is deliberately local to accessory selection — laddered slots resolve via
 * `resolveSlot.ts` against the raw (difficulty-unfiltered) pool instead, so the user's current
 * progression rung stays reachable regardless of today's requested difficulty. What this file
 * adds on top of the hard exclusion is the *preference* within the eligible pool — a medium
 * request should still favor a medium exercise over an eligible easy one, and a hard request a
 * hard exercise over an eligible medium one — via `DIFFICULTY_PREFERENCE_BONUS` in `score()`.
 */
import type { Exercise, Focus, Pattern } from '@roamfit/data';
import type { TemplateSlot } from '../template/focusTemplate';
import { isDifficultyEligible } from '../filters/hardFilters';
import type {
  Candidate,
  Difficulty,
  EquipmentPreference,
  LocalDate,
  PatternGapNote,
  SessionHistoryRecord,
  UserState,
} from '../types';
import type { Rng } from '../types';
import { buildCandidates, sessionsAgo, recencyTier } from './candidates';
import { overWorkedMuscles, recentHardMuscles } from './volume';
import {
  BAND_MIN_RATIO,
  DIFFICULTY_PREFERENCE_BONUS,
  LIGHT_MUSCLE_BONUS,
  PREFERRED_MIN_RATIO,
  TARGET_MUSCLE_BONUS,
} from './constants';
import {
  cooldownWindowsFor,
  recoveryWindowDaysFor,
  resolveTrainingPreferences,
} from '../preferences';

/** For a `medium`/`hard` request, the pool already includes one neighboring tier (§ eligibility
 *  in `hardFilters.ts`'s `isDifficultyEligible`) — this is which of the two eligible tiers the
 *  score should nudge selection toward. `easy` has only one eligible tier, so nothing to prefer. */
function preferredDifficulty(requested: Difficulty): Difficulty | null {
  return requested === 'easy' ? null : requested;
}

export interface SelectedMain {
  slotId: string;
  slotPatterns: Pattern[];
  exercise: Exercise;
  candidate: Candidate;
  /** §5.2 48h recovery — this exercise touches a muscle trained hard in the last 2 days; the
   *  prescription stage must drop a band size and this exercise's difficulty must not be `hard`. */
  recoveryTreatment: boolean;
  /** Selected via the pattern-gap band exception, not the requested equipment preference. */
  bandRelaxedForPatternGap: boolean;
}

export interface MainSelectionResult {
  picks: SelectedMain[];
  patternGaps: PatternGapNote[];
}

function overlaps(a: readonly string[], b: ReadonlySet<string>): boolean {
  return a.some((x) => b.has(x));
}

function sameMuscleSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((m) => b.includes(m));
}

/**
 * User-reported: a 60-minute upper session drew both `bicep-curl` and `single-arm-curl` — same
 * pattern, same primary (biceps) and secondary (forearms) muscles, same equipment, same setup;
 * the only difference is one arm at a time instead of both. That's not variety, it's the same
 * exercise counted twice (and, per `expandOptionalSlots`, exactly the situation a duplicate-
 * pattern filler slot produces once a focus's small accessory-pattern list is exhausted — see
 * `ACCESSORY_PATTERNS_BY_FOCUS`). A genuine variant (e.g. `hammer-curl`'s grip change, or
 * `reverse-curl`'s different primary muscle) is unaffected — this only catches the case where
 * *everything* matches except the unilateral flag, which is specifically "the same lift, split
 * across two slots" rather than a different movement.
 */
function isMovementTwin(a: Exercise, b: Exercise): boolean {
  if (a.id === b.id) return false;
  if (a.pattern !== b.pattern) return false;
  if (a.equipment !== b.equipment) return false;
  if (a.unilateral === b.unilateral) return false;
  return sameMuscleSet(a.primary, b.primary) && sameMuscleSet(a.secondary, b.secondary);
}

function eligibleForSlot(
  candidates: readonly Candidate[],
  slot: TemplateSlot,
  usedIds: ReadonlySet<string>,
  overWorked: ReadonlySet<string>,
  usedExercises: readonly Exercise[] = [],
): Candidate[] {
  return candidates.filter((c) => {
    if (usedIds.has(c.exercise.id)) return false;
    if (c.isSuppressed) return false;
    if (c.tier === 'blocked') return false;
    // OVER-WORKED: never as primary mover — a candidate whose *primary* muscle is over-worked
    // is excluded outright, not merely deprioritized.
    if (overlaps(c.exercise.primary, overWorked)) return false;
    if (usedExercises.some((u) => isMovementTwin(c.exercise, u))) return false;
    return slot.patterns.includes(c.exercise.pattern);
  });
}

interface ScoreState {
  overWorked: ReadonlySet<string>;
  recoveryMuscles: ReadonlySet<string>;
  recoveryUsed: boolean;
  noveltyUsed: boolean;
  preferredDifficulty: Difficulty | null;
  /** The week's lightest muscle for this focus; its bonus lapses once a pick trains it. */
  targetMuscle: string | null;
  targetCovered: boolean;
  /** 0..1 below-average-ness per muscle (see `muscleDeficits`). */
  muscleDeficits: ReadonlyMap<string, number>;
}

function score(c: Candidate, st: ScoreState, rng: Rng): number {
  let s = 0;
  s += c.tier === 'preferred' ? 2000 : 1000; // eligibleForSlot already excludes 'blocked'
  if (st.preferredDifficulty !== null && c.exercise.difficulty === st.preferredDifficulty) {
    s += DIFFICULTY_PREFERENCE_BONUS;
  }
  if (c.isNovel && !st.noveltyUsed) s += 400;
  if (
    overlaps(c.exercise.secondary, st.overWorked) &&
    !overlaps(c.exercise.primary, st.overWorked)
  ) {
    s -= 50;
  }
  // Lesser-worked muscles: lean on the week's lightest muscle until something trains it, and give
  // a graded nudge to any other muscle sitting below the mean. Only reorders already-eligible
  // candidates — OVER-WORKED / BLOCKED / recovery above and below are untouched.
  if (
    st.targetMuscle !== null &&
    !st.targetCovered &&
    c.exercise.primary.includes(st.targetMuscle)
  ) {
    s += TARGET_MUSCLE_BONUS;
  }
  let deficit = 0;
  for (const m of c.exercise.primary) deficit = Math.max(deficit, st.muscleDeficits.get(m) ?? 0);
  s += LIGHT_MUSCLE_BONUS * deficit;
  const touchesRecovery = overlaps(c.exercise.primary, st.recoveryMuscles);
  if (touchesRecovery) {
    s -= st.recoveryUsed ? 3000 : 30; // one is tolerated, a second is heavily discouraged
  }
  s += rng.next() * 3; // deterministic jitter, tie-break only
  return s;
}

function pickBest(candidates: readonly Candidate[], st: ScoreState, rng: Rng): Candidate {
  let best = candidates[0];
  let bestScore = score(best, st, rng);
  for (let i = 1; i < candidates.length; i++) {
    const s = score(candidates[i], st, rng);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return best;
}

export interface SelectMainInput {
  slots: readonly TemplateSlot[];
  pool: readonly Exercise[]; // already hard-filtered (§5.1 step 1) — and, for MAIN work, further
  // scoped to this focus's eligible patterns by the caller (Track 14: conditioning-only for
  // cardio, conditioning-excluded otherwise). This is the pool candidates are actually drawn from.
  poolIgnoringEquipment: readonly Exercise[]; // hard-filtered on anchor/injury only — for the
  // §5.2 PATTERN GAP band exception, which may need a band exercise even when the caller asked
  // for bodyweight-only.
  /**
   * Track 14 — the UNscoped hard-filtered pool, used only for the §5.2 OVER-WORKED/48h-recovery
   * volume math (`overWorkedMuscles`/`recentHardMuscles` below). Those functions look up *history*
   * entries by id to find what muscles they trained; a history entry from a different-focus
   * session (yesterday's legs day, or last week's cardio day) must still resolve even while
   * `pool` above is narrowed to this session's own focus. Defaults to `pool` so every call site
   * that predates this scoping — every non-pipeline caller, every existing test — keeps reading
   * volume off the same pool it always did.
   */
  volumePool?: readonly Exercise[];
  userState: UserState;
  today: LocalDate;
  rng: Rng;
  focus: Focus;
  equipmentPreference: EquipmentPreference;
  requestedDifficulty: Difficulty;
  /** Lesser-worked-muscle emphasis; omitted = no preference (every pre-existing caller). */
  lightMuscles?: { target: string | null; deficits: ReadonlyMap<string, number> };
}

export function selectMain(input: SelectMainInput): MainSelectionResult {
  const { slots, pool, poolIgnoringEquipment, userState, today, rng, equipmentPreference, focus } =
    input;
  const { requestedDifficulty } = input;
  const history = userState.history;
  const training = resolveTrainingPreferences(userState.profile.training);
  const ctx = {
    history,
    exerciseStates: userState.exerciseStates,
    today,
    cooldowns: cooldownWindowsFor(training.variety),
  };

  // OVER-WORKED / recovery are about which muscles the pool can train, not about difficulty, so
  // they read the full (difficulty-unfiltered), UNscoped pool — see `volumePool`'s doc comment.
  const volumePool = input.volumePool ?? pool;
  const overWorked = overWorkedMuscles(history, volumePool, today);
  const recoveryMuscles = recentHardMuscles(
    history,
    volumePool,
    today,
    recoveryWindowDaysFor(training.recovery),
  );

  const difficultyEligiblePool = pool.filter((e) => isDifficultyEligible(e, requestedDifficulty));
  const difficultyEligiblePoolIgnoringEquipment = poolIgnoringEquipment.filter((e) =>
    isDifficultyEligible(e, requestedDifficulty),
  );

  const candidates = buildCandidates(difficultyEligiblePool, 'main', ctx);
  const usedIds = new Set<string>();
  // Parallel to `usedIds`, but full `Exercise` objects — `eligibleForSlot` needs the actual
  // primary/secondary/equipment/unilateral fields to catch a movement twin, not just the id.
  const usedExercises: Exercise[] = [];
  const picks: SelectedMain[] = [];
  const patternGaps: PatternGapNote[] = [];

  const st: ScoreState = {
    overWorked,
    recoveryMuscles,
    recoveryUsed: false,
    noveltyUsed: false,
    preferredDifficulty: preferredDifficulty(input.requestedDifficulty),
    targetMuscle: input.lightMuscles?.target ?? null,
    targetCovered: false,
    muscleDeficits: input.lightMuscles?.deficits ?? new Map(),
  };

  for (const slot of slots) {
    let eligible = eligibleForSlot(candidates, slot, usedIds, overWorked, usedExercises);
    // SOFT COOLDOWN only to fill an otherwise-uncoverable slot: if any preferred candidate
    // exists, drop soft-tier ones from contention; only fall back to soft when preferred is empty.
    const preferredOnly = eligible.filter((c) => c.tier === 'preferred');
    if (preferredOnly.length > 0) eligible = preferredOnly;

    if (eligible.length === 0) {
      if (!slot.required) continue;
      // PATTERN GAP: try the band exception (bodyweight-only sessions can't cover pulling).
      const isPull = slot.patterns.some((p) => p === 'horizontal_pull' || p === 'vertical_pull');
      if (equipmentPreference === 'bodyweight' && isPull) {
        const relaxedCandidates = buildCandidates(
          difficultyEligiblePoolIgnoringEquipment,
          'main',
          ctx,
        ).filter((c) => c.exercise.equipment === 'band');
        const relaxedEligible = eligibleForSlot(
          relaxedCandidates,
          slot,
          usedIds,
          overWorked,
          usedExercises,
        );
        if (relaxedEligible.length > 0) {
          const chosen = pickBest(relaxedEligible, st, rng);
          usedIds.add(chosen.exercise.id);
          usedExercises.push(chosen.exercise);
          if (chosen.isNovel) st.noveltyUsed = true;
          if (st.targetMuscle && chosen.exercise.primary.includes(st.targetMuscle))
            st.targetCovered = true;
          if (overlaps(chosen.exercise.primary, recoveryMuscles)) st.recoveryUsed = true;
          picks.push({
            slotId: slot.id,
            slotPatterns: slot.patterns,
            exercise: chosen.exercise,
            candidate: chosen,
            recoveryTreatment: overlaps(chosen.exercise.primary, recoveryMuscles),
            bandRelaxedForPatternGap: true,
          });
          patternGaps.push({ pattern: slot.patterns[0], resolution: 'used_band' });
          continue;
        }
      }
      patternGaps.push({
        pattern: slot.patterns[0] ?? 'horizontal_pull',
        resolution: 'stated_imbalance',
      });
      continue;
    }

    const chosen = pickBest(eligible, st, rng);
    usedIds.add(chosen.exercise.id);
    usedExercises.push(chosen.exercise);
    if (chosen.isNovel) st.noveltyUsed = true;
    if (st.targetMuscle && chosen.exercise.primary.includes(st.targetMuscle))
      st.targetCovered = true;
    const touchesRecovery = overlaps(chosen.exercise.primary, recoveryMuscles);
    if (touchesRecovery) st.recoveryUsed = true;
    picks.push({
      slotId: slot.id,
      slotPatterns: slot.patterns,
      exercise: chosen.exercise,
      candidate: chosen,
      recoveryTreatment: touchesRecovery,
      bandRelaxedForPatternGap: false,
    });
  }

  applyNoveltyPass(picks, candidates, usedIds, usedExercises, overWorked, st);
  applyAggregatePass(picks, candidates, usedIds, usedExercises, overWorked, st, 'preferred');
  // Track 14 — cardio is exempt from the ≥50% band ratio (user decision): a cardio session is
  // reasonably all-bodyweight (jumping jacks, burpees, sprints in place), and forcing half of it
  // onto a band would fight the format rather than serve variety the way the ratio does for a
  // strength focus. The PATTERN GAP band exception a few lines above this function is unaffected
  // either way — it only ever fires for a `horizontal_pull`/`vertical_pull` slot, which a cardio
  // template never has.
  if (focus !== 'cardio')
    applyAggregatePass(picks, candidates, usedIds, usedExercises, overWorked, st, 'band');

  return { picks, patternGaps };
}

/** The pick that trains the week's lightest muscle — the aggregate passes must not swap it out. */
function holdsTarget(pick: SelectedMain, st: ScoreState): boolean {
  return st.targetMuscle !== null && pick.exercise.primary.includes(st.targetMuscle);
}

/** Swap helpers below replace one pick's exercise for another of the same slot's patterns — the
 *  replacement must not be a movement twin (see `isMovementTwin`) of any *other* already-used
 *  exercise. The pick's own current exercise is excluded from that check since it's the one
 *  being replaced. */
function otherUsedExercises(usedExercises: readonly Exercise[], excludeId: string): Exercise[] {
  return usedExercises.filter((u) => u.id !== excludeId);
}

/** §5.2 — include ≥1 novelty exercise whenever one fits a slot, if the greedy fill didn't
 *  already surface one. Single best-effort swap: try each pick's slot for a novel alternative. */
function applyNoveltyPass(
  picks: SelectedMain[],
  candidates: readonly Candidate[],
  usedIds: Set<string>,
  usedExercises: Exercise[],
  overWorked: ReadonlySet<string>,
  st: ScoreState,
): void {
  if (st.noveltyUsed || picks.length === 0) return;
  for (const pick of picks) {
    if (holdsTarget(pick, st)) continue;
    const others = otherUsedExercises(usedExercises, pick.exercise.id);
    const alt = candidates.find(
      (c) =>
        c.isNovel &&
        !usedIds.has(c.exercise.id) &&
        c.tier !== 'blocked' &&
        !c.isSuppressed &&
        !overlaps(c.exercise.primary, overWorked) &&
        pick.slotPatterns.includes(c.exercise.pattern) &&
        !others.some((u) => isMovementTwin(c.exercise, u)),
    );
    if (alt) {
      usedIds.delete(pick.exercise.id);
      usedIds.add(alt.exercise.id);
      const idx = usedExercises.findIndex((u) => u.id === pick.exercise.id);
      if (idx !== -1) usedExercises[idx] = alt.exercise;
      pick.exercise = alt.exercise;
      pick.candidate = alt;
      st.noveltyUsed = true;
      return;
    }
  }
}

/** ≥70% PREFERRED or ≥50% band-equipment, as whole-session aggregates. Swaps soft-tier /
 *  bodyweight picks (respectively) for a same-pattern alternative that improves the ratio,
 *  one candidate at a time, until the target is met or no further swap is available. */
function applyAggregatePass(
  picks: SelectedMain[],
  candidates: readonly Candidate[],
  usedIds: Set<string>,
  usedExercises: Exercise[],
  overWorked: ReadonlySet<string>,
  st: ScoreState,
  kind: 'preferred' | 'band',
): void {
  if (picks.length === 0) return;
  const meetsTarget = () =>
    kind === 'preferred'
      ? picks.filter((p) => p.candidate.tier === 'preferred').length / picks.length >=
        PREFERRED_MIN_RATIO
      : picks.filter((p) => p.exercise.equipment === 'band').length / picks.length >=
        BAND_MIN_RATIO;

  let guard = picks.length; // at most one swap attempt per pick
  while (!meetsTarget() && guard-- > 0) {
    const victim = picks.find(
      (p) =>
        !holdsTarget(p, st) &&
        (kind === 'preferred' ? p.candidate.tier !== 'preferred' : p.exercise.equipment !== 'band'),
    );
    if (!victim) break;
    const others = otherUsedExercises(usedExercises, victim.exercise.id);
    const alt = candidates.find(
      (c) =>
        !usedIds.has(c.exercise.id) &&
        c.tier !== 'blocked' &&
        !c.isSuppressed &&
        !overlaps(c.exercise.primary, overWorked) &&
        victim.slotPatterns.includes(c.exercise.pattern) &&
        (kind === 'preferred' ? c.tier === 'preferred' : c.exercise.equipment === 'band') &&
        !others.some((u) => isMovementTwin(c.exercise, u)),
    );
    if (!alt) break;
    usedIds.delete(victim.exercise.id);
    usedIds.add(alt.exercise.id);
    const idx = usedExercises.findIndex((u) => u.id === victim.exercise.id);
    if (idx !== -1) usedExercises[idx] = alt.exercise;
    victim.exercise = alt.exercise;
    victim.candidate = alt;
  }
}

export { overlaps, eligibleForSlot, sessionsAgo, recencyTier };
export type { SessionHistoryRecord };
