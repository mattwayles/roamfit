/**
 * §5.1 step 3 / §5.2 — selection for `role: main` slots. Applies, per slot in template
 * priority order, then re-checks as whole-session aggregates:
 *
 *   BLOCKED (never) → suppressed/REPEATEDLY-SKIPPED (never, while active) → OVER-WORKED muscles
 *   never as primary mover, ≤1 exercise touching one at all → 48h recovery muscles ≤1 exercise →
 *   UNTRAINED/LOW prioritized → novelty preferred → enjoyment tie-break (avoid ≤2 unless
 *   nothing else fills the slot) → PATTERN GAP handling for an unfillable required slot →
 *   aggregate passes: ≥1 novelty, ≥70% PREFERRED, ≥50% band, ≤~40% favorites.
 *
 * Resolution order when these can't all be satisfied on a thin pool (recorded in
 * STATUS-2-engine.md as a judgment call, not stated in spec.md): hard filters and BLOCKED first
 * (never relaxed) → PATTERN GAP avoidance (a band exception for an otherwise-empty pull slot) →
 * band ratio → PREFERRED ratio → favorites cap → novelty is opportunistic throughout, not a
 * final override, since forcing it late can undo an already-satisfied aggregate.
 */
import type { Exercise, Focus, Pattern } from '@roamfit/data';
import type { TemplateSlot } from '../template/focusTemplate';
import type {
  Candidate,
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
  AVOID_ENJOYMENT_MAX,
  BAND_MIN_RATIO,
  FAVORITE_ENJOYMENT_MIN,
  FAVORITES_CAP_RATIO,
  PREFERRED_MIN_RATIO,
  RECOVERY_WINDOW_DAYS,
} from './constants';

export interface SelectedMain {
  slotId: string;
  slotPatterns: Pattern[];
  exercise: Exercise;
  candidate: Candidate;
  /** §5.2 48h recovery — this exercise touches a muscle trained hard in the last 2 days; the
   *  prescription stage must drop a band size and this exercise's effort must not be `hard`. */
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

function eligibleForSlot(
  candidates: readonly Candidate[],
  slot: TemplateSlot,
  usedIds: ReadonlySet<string>,
  overWorked: ReadonlySet<string>,
): Candidate[] {
  return candidates.filter((c) => {
    if (usedIds.has(c.exercise.id)) return false;
    if (c.isSuppressed) return false;
    if (c.tier === 'blocked') return false;
    // OVER-WORKED: never as primary mover — a candidate whose *primary* muscle is over-worked
    // is excluded outright, not merely deprioritized.
    if (overlaps(c.exercise.primary, overWorked)) return false;
    if (slot.isFinisher) return c.exercise.tier === 'fill';
    return slot.patterns.includes(c.exercise.pattern);
  });
}

interface ScoreState {
  overWorked: ReadonlySet<string>;
  recoveryMuscles: ReadonlySet<string>;
  recoveryUsed: boolean;
  favoritesCount: number;
  favoritesCap: number;
  noveltyUsed: boolean;
}

function score(c: Candidate, st: ScoreState, rng: Rng): number {
  let s = 0;
  s += c.tier === 'preferred' ? 2000 : 1000; // eligibleForSlot already excludes 'blocked'
  if (c.isNovel && !st.noveltyUsed) s += 400;
  if (c.enjoyment <= AVOID_ENJOYMENT_MAX) {
    s -= 3000; // avoid ≤2, but still selectable if it's the only candidate
  } else {
    s += c.enjoyment * 10;
  }
  if (st.favoritesCount >= st.favoritesCap && c.enjoyment >= FAVORITE_ENJOYMENT_MIN) {
    s -= 500; // discourage tipping the favorites cap further, but don't forbid outright
  }
  if (
    overlaps(c.exercise.secondary, st.overWorked) &&
    !overlaps(c.exercise.primary, st.overWorked)
  ) {
    s -= 50;
  }
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
  pool: readonly Exercise[]; // already hard-filtered (§5.1 step 1)
  poolIgnoringEquipment: readonly Exercise[]; // hard-filtered on anchor/injury only — for the
  // §5.2 PATTERN GAP band exception, which may need a band exercise even when the caller asked
  // for bodyweight-only.
  userState: UserState;
  today: LocalDate;
  rng: Rng;
  focus: Focus;
  equipmentPreference: EquipmentPreference;
}

export function selectMain(input: SelectMainInput): MainSelectionResult {
  const { slots, pool, poolIgnoringEquipment, userState, today, rng, equipmentPreference } = input;
  const history = userState.history;
  const ctx = { history, exerciseStates: userState.exerciseStates, today };

  const overWorked = overWorkedMuscles(history, pool, today);
  const recoveryMuscles = recentHardMuscles(history, pool, today, RECOVERY_WINDOW_DAYS);

  const candidates = buildCandidates(pool, 'main', ctx);
  const usedIds = new Set<string>();
  const picks: SelectedMain[] = [];
  const patternGaps: PatternGapNote[] = [];

  const st: ScoreState = {
    overWorked,
    recoveryMuscles,
    recoveryUsed: false,
    favoritesCount: 0,
    favoritesCap: Infinity, // set once mainCount is known-ish; approximated below per slot
    noveltyUsed: false,
  };

  const requiredCount = slots.filter((s) => s.required).length;

  for (const slot of slots) {
    st.favoritesCap = Math.floor(Math.max(requiredCount, slots.length) * FAVORITES_CAP_RATIO);
    let eligible = eligibleForSlot(candidates, slot, usedIds, overWorked);
    // SOFT COOLDOWN only to fill an otherwise-uncoverable slot: if any preferred candidate
    // exists, drop soft-tier ones from contention; only fall back to soft when preferred is empty.
    const preferredOnly = eligible.filter((c) => c.tier === 'preferred');
    if (preferredOnly.length > 0) eligible = preferredOnly;

    if (eligible.length === 0) {
      if (!slot.required) continue;
      // PATTERN GAP: try the band exception (bodyweight-only sessions can't cover pulling).
      const isPull = slot.patterns.some((p) => p === 'horizontal_pull' || p === 'vertical_pull');
      if (equipmentPreference === 'bodyweight' && isPull) {
        const relaxedCandidates = buildCandidates(poolIgnoringEquipment, 'main', ctx).filter(
          (c) => c.exercise.equipment === 'band',
        );
        const relaxedEligible = eligibleForSlot(relaxedCandidates, slot, usedIds, overWorked);
        if (relaxedEligible.length > 0) {
          const chosen = pickBest(relaxedEligible, st, rng);
          usedIds.add(chosen.exercise.id);
          if (chosen.isNovel) st.noveltyUsed = true;
          if (chosen.enjoyment >= FAVORITE_ENJOYMENT_MIN) st.favoritesCount++;
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
    if (chosen.isNovel) st.noveltyUsed = true;
    if (chosen.enjoyment >= FAVORITE_ENJOYMENT_MIN) st.favoritesCount++;
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

  applyNoveltyPass(picks, candidates, usedIds, overWorked, st);
  applyAggregatePass(picks, candidates, usedIds, overWorked, st, 'preferred');
  applyAggregatePass(picks, candidates, usedIds, overWorked, st, 'band');
  applyFavoritesCapPass(picks, candidates, usedIds, overWorked);

  return { picks, patternGaps };
}

/** §5.2 — include ≥1 novelty exercise whenever one fits a slot, if the greedy fill didn't
 *  already surface one. Single best-effort swap: try each pick's slot for a novel alternative. */
function applyNoveltyPass(
  picks: SelectedMain[],
  candidates: readonly Candidate[],
  usedIds: Set<string>,
  overWorked: ReadonlySet<string>,
  st: ScoreState,
): void {
  if (st.noveltyUsed || picks.length === 0) return;
  for (const pick of picks) {
    const alt = candidates.find(
      (c) =>
        c.isNovel &&
        !usedIds.has(c.exercise.id) &&
        c.tier !== 'blocked' &&
        !c.isSuppressed &&
        !overlaps(c.exercise.primary, overWorked) &&
        pick.slotPatterns.includes(c.exercise.pattern),
    );
    if (alt) {
      usedIds.delete(pick.exercise.id);
      usedIds.add(alt.exercise.id);
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
    const victim = picks.find((p) =>
      kind === 'preferred' ? p.candidate.tier !== 'preferred' : p.exercise.equipment !== 'band',
    );
    if (!victim) break;
    const alt = candidates.find(
      (c) =>
        !usedIds.has(c.exercise.id) &&
        c.tier !== 'blocked' &&
        !c.isSuppressed &&
        !overlaps(c.exercise.primary, overWorked) &&
        victim.slotPatterns.includes(c.exercise.pattern) &&
        (kind === 'preferred' ? c.tier === 'preferred' : c.exercise.equipment === 'band'),
    );
    if (!alt) break;
    usedIds.delete(victim.exercise.id);
    usedIds.add(alt.exercise.id);
    victim.exercise = alt.exercise;
    victim.candidate = alt;
  }
}

/** Favorites capped at ~40% of the session so enjoyment never quietly undoes variety. */
function applyFavoritesCapPass(
  picks: SelectedMain[],
  candidates: readonly Candidate[],
  usedIds: Set<string>,
  overWorked: ReadonlySet<string>,
): void {
  if (picks.length === 0) return;
  const cap = Math.ceil(picks.length * FAVORITES_CAP_RATIO);
  let guard = picks.length;
  while (
    picks.filter((p) => p.candidate.enjoyment >= FAVORITE_ENJOYMENT_MIN).length > cap &&
    guard-- > 0
  ) {
    const victim = picks.find((p) => p.candidate.enjoyment >= FAVORITE_ENJOYMENT_MIN);
    if (!victim) break;
    const alt = candidates.find(
      (c) =>
        !usedIds.has(c.exercise.id) &&
        c.tier !== 'blocked' &&
        !c.isSuppressed &&
        c.enjoyment < FAVORITE_ENJOYMENT_MIN &&
        !overlaps(c.exercise.primary, overWorked) &&
        victim.slotPatterns.includes(c.exercise.pattern),
    );
    if (!alt) break;
    usedIds.delete(victim.exercise.id);
    usedIds.add(alt.exercise.id);
    victim.exercise = alt.exercise;
    victim.candidate = alt;
  }
}

export { overlaps, eligibleForSlot, sessionsAgo, recencyTier };
export type { SessionHistoryRecord };
