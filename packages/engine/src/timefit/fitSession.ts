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
  const budgetSec = mainBudgetSec(targetMinutes);
  const required = slots.filter((s) => s.required).map((s) => s.entry);
  const optional = slots.filter((s) => !s.required).map((s) => s.entry);

  let total = required.reduce((sum, e) => sum + e.estimatedSec, 0);
  const chosen = [...required];

  // §5.6: "fill main_sec until the next exercise would overshoot." A small overshoot allowance
  // (the ±10% ceiling itself) lets one more useful exercise in when it's a close call, rather
  // than leaving a session noticeably short of a round number for the sake of a few seconds.
  const ceiling = budgetSec * 1.1;
  for (const entry of optional) {
    if (total + entry.estimatedSec <= ceiling) {
      chosen.push(entry);
      total += entry.estimatedSec;
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
