/**
 * §5.1 step 6 — run the §5.6 budget formula; add or drop until within ±10% of target. Operates
 * on already-prescribed entries (required slots first, then optional slots in template priority
 * order) — selection/progression/prescription have already produced each entry's `estimatedSec`;
 * this stage only decides how many of the *optional* entries make the cut. Required entries are
 * never dropped here (a required slot that couldn't be filled at all is a PATTERN GAP, handled
 * upstream in selection, not a time-fit trim).
 */
import type { SessionEntry } from '../types';
import { cooldownMinutes, mainBudgetSec, mainExerciseCountRange, warmupMinutes } from './formulas';

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
  const required = slots.filter((s) => s.required).map((s) => s.entry);
  const optional = slots.filter((s) => !s.required).map((s) => s.entry);

  let total = required.reduce((sum, e) => sum + e.estimatedSec, 0);
  const chosen = [...required];

  // §5.6: "fill main_sec until the next exercise would overshoot." Strictly never cross the
  // polite +10% ceiling on the ADD side — an earlier version of this function let the loop reach
  // *past* the ceiling (up to a harder one) when the running total was still under the floor, to
  // avoid landing short. That produced a worse failure mode than the one it was solving: real
  // overruns against a promised time (§1.1 names overrunning specifically as the churn risk,
  // worse than a shortfall a caller can label honestly). A shortfall from under-supply is now
  // fixed upstream by giving this function more optional entries to choose from
  // (`template.expandOptionalSlots`), not by letting this loop overshoot to compensate. If
  // required entries alone are already over the ceiling, that's on the caller to trim via
  // prescription (see `pipeline.ts`'s corrective sets multiplier) — this loop only ever adds.
  const politeCeiling = budgetSec * 1.1;
  for (const entry of optional) {
    const candidateTotal = total + entry.estimatedSec;
    if (candidateTotal <= politeCeiling) {
      chosen.push(entry);
      total = candidateTotal;
    } else {
      break;
    }
  }

  const estimatedMinutes = Math.round((warmupSec + cooldownSec + total) / 60);
  const [minCount, maxCount] = mainExerciseCountRange(targetMinutes);
  const withinExerciseCountSanity = chosen.length >= minCount && chosen.length <= maxCount;
  const withinTenPercent =
    estimatedMinutes >= targetMinutes * 0.9 && estimatedMinutes <= targetMinutes * 1.1;

  return { main: chosen, estimatedMinutes, withinExerciseCountSanity, withinTenPercent };
}

export { warmupMinutes, cooldownMinutes, mainBudgetSec };
