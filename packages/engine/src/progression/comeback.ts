/**
 * §9.4 The comeback path. Gap ≥7 days: regress one micro-step per family + cut this session's
 * volume ~20%. Gap ≥21 days: re-enter calibration (§6.5) for every family.
 *
 * §9.9 Recovery Week reuses the 7-day ("week") treatment through this exact same function — it
 * is not a parallel implementation. Whatever triggers it (an auto-detected gap, or a user
 * opting into a Recovery Week), the transform is identical: one micro regress per family and a
 * volume cut for the session, applied via `applyComebackTreatment`.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';
import { daysBetween } from '../dates';
import { microRegress } from './micro';
import type { LocalDate, ProgressionState, SessionHistoryRecord } from '../types';
import {
  COMEBACK_RESET_GAP_DAYS,
  COMEBACK_VOLUME_MULTIPLIER,
  COMEBACK_WEEK_GAP_DAYS,
} from './constants';

export type ComebackTier = 'none' | 'week' | 'reset';

export interface ComebackAssessment {
  tier: ComebackTier;
  gapDays: number | null;
  /** Multiply this session's prescribed sets by this factor (§9.4/§9.9's ~20% cut). 1 = no cut. */
  volumeMultiplier: number;
  /** §9.4 copy — shown once, no mention of the gap length. */
  notice: string | null;
}

/** Most recent non-discarded session's `local_date`, across all foci — comeback is a whole-user
 *  event ("the next session"), not computed per family. */
function lastActiveSessionDate(history: readonly SessionHistoryRecord[]): LocalDate | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status !== 'discarded') return history[i].localDate;
  }
  return null;
}

export function assessComeback(
  history: readonly SessionHistoryRecord[],
  today: LocalDate,
): ComebackAssessment {
  const last = lastActiveSessionDate(history);
  if (!last) return { tier: 'none', gapDays: null, volumeMultiplier: 1, notice: null };
  const gap = daysBetween(last, today);
  if (gap >= COMEBACK_RESET_GAP_DAYS) {
    return { tier: 'reset', gapDays: gap, volumeMultiplier: 1, notice: null };
  }
  if (gap >= COMEBACK_WEEK_GAP_DAYS) {
    return {
      tier: 'week',
      gapDays: gap,
      volumeMultiplier: COMEBACK_VOLUME_MULTIPLIER,
      notice: 'Welcome back — let’s ease in.',
    };
  }
  return { tier: 'none', gapDays: gap, volumeMultiplier: 1, notice: null };
}

/**
 * Applies the `tier` transform to every family's progression state. Pure — returns a new map,
 * never mutates. This is the single code path for both the auto-detected 7/21-day comeback and
 * an explicitly-triggered Recovery Week (§9.9): callers pass `tier: 'week'` either way.
 */
export function applyComebackToProgressionStates(
  states: Readonly<Record<ProgressionFamilyId, ProgressionState>>,
  families: readonly ProgressionFamily[],
  library: readonly Exercise[],
  tier: ComebackTier,
): Record<ProgressionFamilyId, ProgressionState> {
  if (tier === 'none') return { ...states };
  const out: Record<string, ProgressionState> = {};
  for (const [familyId, state] of Object.entries(states)) {
    const family = families.find((f) => f.id === familyId);
    if (!family) {
      out[familyId] = state;
      continue;
    }
    if (tier === 'reset') {
      out[familyId] = { ...state, calibrating: true, consecutiveHits: 0, consecutiveMisses: 0 };
      continue;
    }
    // tier === 'week': one micro regress step per family.
    const level = family.levels.find((l) => l.level_id === state.levelId);
    const exercise = level && library.find((e) => e.id === level.anchor_exercise_id);
    if (!exercise) {
      out[familyId] = state;
      continue;
    }
    // Already at the floor micro-step: hold there rather than dropping a level — a comeback
    // regress is a one-step nudge, never the two-consecutive-regressions level drop (§6.3).
    const step = microRegress(state.micro, exercise);
    out[familyId] = step.levelChange === 'down' ? state : { ...state, micro: step.micro };
  }
  return out;
}
