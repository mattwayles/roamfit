/**
 * §5.1 step 6 — run the §5.6 budget formula; add or drop until within ±10% of target. Operates
 * on already-prescribed entries in template priority order (required slots first, then optional)
 * — selection/progression/prescription have already produced each entry's `estimatedSec`.
 *
 * No focus's required pattern slots are a hard floor on session length: with a realistic
 * per-exercise transition buffer, a short target genuinely cannot always fit every required
 * pattern even at the 1-set floor. `required` is priority, not a guarantee — it means "try this
 * before any optional slot," not "include no matter what." A slot that still doesn't fit at its
 * 1-set floor is dropped exactly like an optional one would be, rather than forcing the session
 * over budget. (A required slot with *zero eligible exercises* is a different thing, a PATTERN
 * GAP, handled upstream in selection — this is purely about time, not eligibility.)
 */
import type { SessionEntry } from '../types';
import { cooldownMinutes, mainBudgetSec, mainExerciseCountRange, warmupMinutes } from './formulas';
import { withOneFewerSet } from '../prescription/prescribe';

export interface SlotEntry {
  required: boolean;
  entry: SessionEntry;
}

export interface FitResult {
  main: SessionEntry[];
  estimatedMinutes: number;
  /** §5.6 sanity check — whether the final main count falls in the table's expected range for
   *  this target length. False is not an error (a thin pool can legitimately fall short); the
   *  caller may want to note it in the explanation line. */
  withinExerciseCountSanity: boolean;
  withinTenPercent: boolean;
}

export function fitMainEntries(
  slots: readonly SlotEntry[],
  targetMinutes: number,
  warmupSec: number,
  cooldownSec: number,
): FitResult {
  // Use the *actual* prescribed warmup/cooldown time to size the main budget, not
  // `mainBudgetSec`'s clamp-formula estimate of what they'd typically take. The two normally
  // agree (a full session's warmup/cooldown selection is calibrated to hit that estimate), but
  // §9.5 Quick Session deliberately prescribes far less warmup/cooldown than the general clamp
  // (one short movement, not several minutes' worth) — sizing the main budget off the formula
  // instead of reality was starving Quick Session's main budget down to almost nothing.
  const budgetSec = Math.max(0, targetMinutes * 60 - warmupSec - cooldownSec);

  let total = 0;
  const chosen: SessionEntry[] = [];

  // §5.6: "fill main_sec until the next exercise would overshoot." Strictly never cross the
  // polite +10% ceiling on the ADD side — an earlier version of this function let the loop reach
  // *past* the ceiling (up to a harder one) when the running total was still under the floor, to
  // avoid landing short. That produced a worse failure mode than the one it was solving: real
  // overruns against a promised time (§1.1 names overrunning specifically as the churn risk,
  // worse than a shortfall a caller can label honestly). A shortfall from under-supply is now
  // fixed upstream by giving this function more optional entries to choose from
  // (`template.expandOptionalSlots`), not by letting this loop overshoot to compensate.
  //
  // Two bugs, found together by an independent review of carried-forward issue #7 (§5.5/§5.6):
  // (1) this loop used to `break` on the first entry that didn't fit, which makes slot *order*
  // rather than slot *size* decide what gets in — a smaller entry later in the (priority-ordered)
  // list could fit the remaining room but was never even tried. Now it tries every remaining
  // entry regardless of an earlier miss.
  // (2) even trying every entry, several real entries (e.g. an isolation exercise prescribed at 3
  // sets) can all be larger than the room actually left, while a *smaller* prescription of that
  // same exercise (fewer sets) would fit and is still real, useful work — preferable to leaving
  // the slot empty. Before giving up on a candidate that doesn't fit at its prescribed size, try
  // it at one fewer set at a time (down to the 1-set floor); use the smallest trimmed version
  // that fits, never one that still doesn't.
  //
  // This applies uniformly to required and optional slots alike — see the module comment above.
  // Required slots are tried first (template order puts them ahead of optional ones), so they get
  // first claim on the budget, but a required slot that still can't fit even at 1 set is dropped
  // rather than forced through.
  const politeCeiling = budgetSec * 1.1;
  for (const slot of slots) {
    let candidate = slot.entry;
    let candidateTotal = total + candidate.estimatedSec;
    while (candidateTotal > politeCeiling && candidate.sets > 1) {
      const trimmed = withOneFewerSet(candidate);
      if (trimmed.sets === candidate.sets) break; // no-op floor reached
      candidate = trimmed;
      candidateTotal = total + candidate.estimatedSec;
    }
    if (candidateTotal <= politeCeiling) {
      chosen.push(candidate);
      total = candidateTotal;
    }
    // else: this entry genuinely can't fit even at the 1-set floor — skip it and keep trying the
    // rest of the list, rather than stopping here.
  }

  const estimatedMinutes = Math.round((warmupSec + cooldownSec + total) / 60);
  const [minCount, maxCount] = mainExerciseCountRange(targetMinutes);
  const withinExerciseCountSanity = chosen.length >= minCount && chosen.length <= maxCount;
  const withinTenPercent =
    estimatedMinutes >= targetMinutes * 0.9 && estimatedMinutes <= targetMinutes * 1.1;

  return { main: chosen, estimatedMinutes, withinExerciseCountSanity, withinTenPercent };
}

export { warmupMinutes, cooldownMinutes, mainBudgetSec };
