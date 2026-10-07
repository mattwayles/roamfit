/**
 * "Lesser-worked muscles" — the prior week's volume turned into (a) a recommended focus for the
 * Today card and (b) a thumb on the scale for generation, so the same muscle that Today calls
 * lightest is the one a generated session leans on.
 *
 * Volume is `trailingVolume` over 7 days (primary 1 credit/set, secondary 0.5; abandoned and
 * skipped sessions never count, ADR 0011). Nothing here relaxes a filter or overrides OVER-WORKED /
 * recovery: it only reorders what selection was already allowed to pick (invariant 2/3).
 */
import type { Exercise, Focus } from '@roamfit/data';
import type { LocalDate, SessionHistoryRecord } from '../types';
import { daysBetween } from '../dates';
import { trailingVolume } from './volume';
import {
  LIGHT_MUSCLE_WINDOW_DAYS,
  MIN_CANDIDATE_MUSCLE_EXERCISES,
  RECOVERY_WINDOW_DAYS,
} from './constants';

/** The user-selectable focuses a muscle can point at — cardio is not a muscle group. */
type MuscleFocus = Exclude<Focus, 'cardio'>;
const SPECIFIC_FOCUSES: readonly MuscleFocus[] = ['upper', 'abs', 'legs'];
/** A muscle belongs to a specific focus when at least this share of its tagged exercises do;
 *  otherwise it is spread across the body and the honest recommendation is `full`. */
const FOCUS_OWNERSHIP_SHARE = 0.6;

const strength = (library: readonly Exercise[]) =>
  library.filter((e) => e.pattern !== 'conditioning');

/** Muscles worth recommending: the primary mover of enough strength exercises that a session can
 *  actually train them (a muscle one exercise reaches, like traps, would otherwise win every week
 *  by sitting at zero). Value = how many such exercises. */
export function candidateMuscles(library: readonly Exercise[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of strength(library)) {
    for (const m of e.primary) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  for (const [m, n] of counts) if (n < MIN_CANDIDATE_MUSCLE_EXERCISES) counts.delete(m);
  return counts;
}

/** Which user-selectable focus best trains `muscle`, by how its primary exercises are tagged. */
export function focusForMuscle(
  muscle: string,
  library: readonly Exercise[],
): Exclude<Focus, 'cardio'> {
  const tally: Record<MuscleFocus, number> = { upper: 0, abs: 0, legs: 0, full: 0 };
  let total = 0;
  for (const e of strength(library)) {
    if (!e.primary.includes(muscle)) continue;
    for (const f of SPECIFIC_FOCUSES) {
      if (e.focus.includes(f)) {
        tally[f]++;
        total++;
      }
    }
  }
  const top = SPECIFIC_FOCUSES.reduce((a, b) => (tally[b] > tally[a] ? b : a));
  return total > 0 && tally[top] / total >= FOCUS_OWNERSHIP_SHARE ? top : 'full';
}

/** Candidate muscles a session of `focus` can train (all of them for full body). */
export function musclesForFocus(focus: Focus, library: readonly Exercise[]): Set<string> {
  const candidates = candidateMuscles(library);
  if (focus === 'cardio') return new Set();
  if (focus === 'full') return new Set(candidates.keys());
  const out = new Set<string>();
  for (const e of strength(library)) {
    if (!e.focus.includes(focus)) continue;
    for (const m of e.primary) if (candidates.has(m)) out.add(m);
  }
  return out;
}

export interface MuscleVolume {
  muscle: string;
  sets: number;
}

/** `relevant` muscles by ascending 7-day volume (ties: the muscle more exercises train first,
 *  then name, so the order is deterministic). Empty when nothing was trained in the window —
 *  with no week to balance there is no signal, and generation behaves exactly as before. */
export function lightestMuscles(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
  relevant: ReadonlySet<string>,
): MuscleVolume[] {
  const vol = trailingVolume(history, library, LIGHT_MUSCLE_WINDOW_DAYS, today);
  if (!Object.values(vol).some((v) => v > 0)) return [];
  const counts = candidateMuscles(library);
  return [...relevant]
    .map((muscle) => ({ muscle, sets: vol[muscle] ?? 0 }))
    .sort(
      (a, b) =>
        a.sets - b.sets ||
        (counts.get(b.muscle) ?? 0) - (counts.get(a.muscle) ?? 0) ||
        a.muscle.localeCompare(b.muscle),
    );
}

export interface FocusRecommendation {
  focus: Focus;
  muscle: string;
  /** Credited sets over the last 7 days; 0 = not trained. */
  sets: number;
}

/** Focuses trained in the last `RECENT_FOCUS_DAYS` days (today and yesterday): the same 48h window
 *  the engine already uses for recovery. Abandoned and skipped sessions trained nothing. */
function recentFocuses(history: readonly SessionHistoryRecord[], today: LocalDate): Set<Focus> {
  const out = new Set<Focus>();
  for (const s of history) {
    if (s.status === 'discarded' || s.status === 'skipped') continue;
    const age = daysBetween(s.localDate, today);
    if (age >= 0 && age < RECOVERY_WINDOW_DAYS) out.add(s.focus);
  }
  return out;
}

/** Today's "Recommended Focus": the focus that trains the week's lightest muscle — skipping any
 *  focus the user trained in the last 48h, so a day that was just done is never the answer (a
 *  lightly-hit biceps after an upper day should not say "Upper" again; the next-lightest muscle
 *  that points elsewhere wins). Null when nothing qualifies. */
export function recommendFocus(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
): FocusRecommendation | null {
  const ranked = lightestMuscles(
    history,
    library,
    today,
    new Set(candidateMuscles(library).keys()),
  );
  const recent = recentFocuses(history, today);
  for (const r of ranked) {
    const focus = focusForMuscle(r.muscle, library);
    if (!recent.has(focus)) return { ...r, focus };
  }
  return null;
}

/** 0..1 — how far a muscle sits below the mean of `ranked` (the muscles this session can train).
 *  Drives the soft preference; the single lightest muscle is handled separately as the target. */
export function muscleDeficits(ranked: readonly MuscleVolume[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ranked.length === 0) return out;
  const mean = ranked.reduce((a, r) => a + r.sets, 0) / ranked.length;
  if (mean <= 0) return out;
  for (const r of ranked) out.set(r.muscle, Math.min(1, Math.max(0, (mean - r.sets) / mean)));
  return out;
}
