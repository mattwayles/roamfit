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

  // §5.6: "fill main_sec until the next exercise would overshoot." The polite ceiling (+10%)
  // lets one more useful exercise in on a close call. But discrete exercise sizes mean a purely
  // greedy "never cross the polite ceiling" rule can strand the session well *under* the floor
  // (-10%) when the next available entry would cross the polite ceiling by a little — and
  // landing short is the worse failure mode (§1.1: "promise the time and keep it"). So: below
  // the floor, reach for one more entry even past the polite ceiling, up to a harder ceiling —
  // never truly unbounded, but biased toward closing the gap from below rather than stopping
  // short of the target for the sake of a strict ceiling.
  const floor = budgetSec * 0.9;
  const politeCeiling = budgetSec * 1.1;
  const hardCeiling = budgetSec * 1.25;
  for (const entry of optional) {
    const candidateTotal = total + entry.estimatedSec;
    const underPoliteCeiling = candidateTotal <= politeCeiling;
    const reachingForFloor = total < floor && candidateTotal <= hardCeiling;
    if (underPoliteCeiling || reachingForFloor) {
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
