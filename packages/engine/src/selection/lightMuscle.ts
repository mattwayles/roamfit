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
import { SECONDARY_CREDIT, trailingVolume } from './volume';
import { LIGHT_MUSCLE_WINDOW_DAYS, MIN_CANDIDATE_MUSCLE_EXERCISES } from './constants';

/** The training areas a week's volume is totalled into: the three muscle-group focuses plus cardio.
 *  Order is the tie-break when two areas are equally light. */
export type FocusArea = 'upper' | 'abs' | 'legs' | 'cardio';
const MUSCLE_AREAS: readonly Exclude<FocusArea, 'cardio'>[] = ['upper', 'abs', 'legs'];
const AREAS: readonly FocusArea[] = [...MUSCLE_AREAS, 'cardio'];

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

/** The area a muscle belongs to: the one most of its primary exercises are tagged for (ties keep
 *  upper, abs, legs order). Muscles spread across areas (lower back) land where they are most used. */
export function areaForMuscle(
  muscle: string,
  library: readonly Exercise[],
): Exclude<FocusArea, 'cardio'> {
  const tally = { upper: 0, abs: 0, legs: 0 };
  for (const e of strength(library)) {
    if (!e.primary.includes(muscle)) continue;
    for (const a of MUSCLE_AREAS) if (e.focus.includes(a)) tally[a]++;
  }
  return MUSCLE_AREAS.reduce((a, b) => (tally[b] > tally[a] ? b : a));
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
  /** Credited sets in the recommended area over the last 7 days (0 for the full-body fallback). */
  sets: number;
  /** `lightest`: the area with the least volume. `no_strength_data`: no strength work in the last
   *  7 days, so full body is the place to start. */
  reason: 'lightest' | 'no_strength_data';
}

/** Credited sets per training area over the last 7 days. A muscle's credit (primary 1/set,
 *  secondary 0.5) goes to its area; a conditioning exercise counts its sets to cardio only (its
 *  muscles are not strength work). Abandoned and skipped sessions trained nothing (ADR 0011). */
export function weeklyAreaVolume(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
): Record<FocusArea, number> {
  const out: Record<FocusArea, number> = { upper: 0, abs: 0, legs: 0, cardio: 0 };
  const byId = new Map(library.map((e) => [e.id, e]));
  const areaOf = new Map<string, Exclude<FocusArea, 'cardio'>>();
  for (const s of history) {
    if (s.status === 'discarded' || s.status === 'skipped') continue;
    const age = daysBetween(s.localDate, today);
    if (age < 0 || age >= LIGHT_MUSCLE_WINDOW_DAYS) continue;
    for (const entry of s.entries) {
      if (entry.role !== 'main') continue;
      const ex = byId.get(entry.exerciseId);
      if (!ex) continue;
      const sets = entry.sets ?? 1;
      if (ex.pattern === 'conditioning') {
        out.cardio += sets;
        continue;
      }
      const credit = (muscle: string, weight: number) => {
        let area = areaOf.get(muscle);
        if (!area) areaOf.set(muscle, (area = areaForMuscle(muscle, library)));
        out[area] += sets * weight;
      };
      for (const m of ex.primary) credit(m, 1);
      for (const m of ex.secondary) credit(m, SECONDARY_CREDIT);
    }
  }
  return out;
}

/** Today's "Recommended Focus": the area (upper / core / legs / cardio) with the lowest total
 *  volume over the last 7 days — muscle volume is summed into its area, so one lightly-hit muscle
 *  does not outweigh a whole area. Full body when there was no strength work at all in the window
 *  (cardio alone does not count), including a fresh install. */
export function recommendFocus(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
): FocusRecommendation {
  const volume = weeklyAreaVolume(history, library, today);
  if (MUSCLE_AREAS.every((a) => volume[a] === 0)) {
    return { focus: 'full', sets: 0, reason: 'no_strength_data' };
  }
  const lightest = AREAS.reduce((a, b) => (volume[b] < volume[a] ? b : a));
  return { focus: lightest, sets: volume[lightest], reason: 'lightest' };
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
