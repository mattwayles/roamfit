/**
 * The completion screen used to show two numbers — minutes and focus — while everything needed
 * for a real "here's what you just did" summary was already sitting on `session.entries[].
 * setLogs`, unread. This is the pure aggregation that was missing: no I/O, no store dependency,
 * just a fold over a `SessionRecord` already loaded in memory (same contract as `dashboard.ts`
 * and `exerciseProgress.ts` — the caller does the reading, this file only derives).
 *
 * Additive framing only (invariant 4): every field here is a count of something that happened,
 * never a comparison against the plan (`session.timeBudgetDeviation` exists and is deliberately
 * not folded in here — "3 minutes under target" is exactly the kind of deficit framing invariant
 * 4 rules out on the one screen that should feel unambiguously good).
 */
import { BAND_ORDER } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { sessionsRepo } from '@roamfit/store';

export interface SessionCompletionStats {
  /** Sets actually performed — skipped and not-reached sets don't count; a skipped set is a
   *  choice, not an accomplishment to tally (matches `statusEmoji`'s neutral treatment). */
  setsCompleted: number;
  /** Sum of `repsActual` across every completed set that logged a rep count. */
  totalReps: number;
  /** Sum of `secondsActual` across every completed set that logged a duration — timed holds and
   *  their rest-extension time are not folded in here, just the working seconds themselves. */
  totalSeconds: number;
  /** Distinct exercises with at least one completed set — a swapped-away or fully-skipped entry
   *  doesn't count toward this. */
  exercisesTrained: number;
  /** The heaviest band used on any completed set this session, by `BAND_ORDER`. Null when every
   *  completed set was bodyweight (no band ever logged). */
  heaviestBand: BandId | null;
}

const EMPTY_STATS: SessionCompletionStats = {
  setsCompleted: 0,
  totalReps: 0,
  totalSeconds: 0,
  exercisesTrained: 0,
  heaviestBand: null,
};

/** Folds every entry's set logs into the completion screen's stat grid. Entries removed at
 *  approval never made it into the workout, so they're excluded the same way the review list
 *  already excludes them (`SummaryScreen.tsx`'s own `entryStatus !== 'removed_at_approval'` filter). */
export function buildSessionCompletionStats(
  session: sessionsRepo.SessionRecord,
): SessionCompletionStats {
  let setsCompleted = 0;
  let totalReps = 0;
  let totalSeconds = 0;
  let exercisesTrained = 0;
  let heaviestBandIndex = -1;

  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    let entryHasCompletedSet = false;

    for (const log of entry.setLogs) {
      if (log.status !== 'completed') continue;
      entryHasCompletedSet = true;
      setsCompleted += 1;
      if (log.repsActual !== null) totalReps += log.repsActual;
      if (log.secondsActual !== null) totalSeconds += log.secondsActual;

      // The band actually used, falling back to the entry's prescribed band when the user didn't
      // log a correction — `bandActual` is only ever set when it differs (see SetLogRecord).
      const band = log.bandActual ?? entry.band;
      if (band) {
        const idx = BAND_ORDER.indexOf(band);
        if (idx > heaviestBandIndex) heaviestBandIndex = idx;
      }
    }

    if (entryHasCompletedSet) exercisesTrained += 1;
  }

  if (setsCompleted === 0) return EMPTY_STATS;

  return {
    setsCompleted,
    totalReps,
    totalSeconds,
    exercisesTrained,
    heaviestBand: heaviestBandIndex >= 0 ? BAND_ORDER[heaviestBandIndex] : null,
  };
}
