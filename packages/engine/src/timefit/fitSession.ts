/**
 * §5.1 step 6 — run the §5.6 budget formula; add or drop until within ±10% of target. Operates
 * on already-prescribed entries, required slots ahead of optional ones — selection/progression/
 * prescription have already produced each entry's `estimatedSec`.
 *
 * No focus's required pattern slots are a hard floor on session length: with a realistic
 * per-exercise transition buffer, a short target genuinely cannot always fit every required
 * pattern even at the 1-set floor. `required` is priority, not a guarantee — it means "try this
 * before any optional slot," not "include no matter what." When a drop is unavoidable, *which*
 * required slot goes is randomized (when an `rng` is given) rather than always the one listed
 * last in template order — see the comment below. (A required slot with *zero eligible
 * exercises* is a different thing, a PATTERN GAP, handled upstream in selection — this is purely
 * about time, not eligibility.)
 */
import type { Rng, SessionEntry } from '../types';
import { cooldownMinutes, mainBudgetSec, mainExerciseCountRange, warmupMinutes } from './formulas';
import { estimateEntrySec, withOneFewerSet } from '../prescription/prescribe';
import { rngIndex } from '../rng';

/** The smallest this entry can be trimmed down to (1 set), for judging whether a *set* of
 *  entries can possibly all fit before committing to trimming any one of them. */
function floorEntry(entry: SessionEntry): SessionEntry {
  let e = entry;
  while (e.sets > 1) {
    const trimmed = withOneFewerSet(e);
    if (trimmed.sets === e.sets) break;
    e = trimmed;
  }
  return e;
}

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
  rng?: Rng,
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

  // If the required slots can't all fit *even at their 1-set floor*, one or more has to go before
  // the fill loop below ever runs — otherwise the fill loop's fixed template order would always
  // sacrifice whichever slot happens to be listed last (e.g. `full`'s squat/hinge/push/pull/core:
  // core always losing, session after session, to patterns that are no more important than it
  // is). That's a predictable, not a deliberate, priority — nothing in the spec ranks squat over
  // core. So when a drop is genuinely unavoidable, pick the slot(s) to drop at random (when an
  // `rng` is given) rather than by position; everything that survives is still fit and trimmed
  // below in ordinary, deterministic template-priority order, exactly as when nothing needed
  // dropping at all — this only changes who gets sacrificed, not how the rest is measured.
  const required = slots.filter((s) => s.required);
  const optional = slots.filter((s) => !s.required);
  const survivingRequired = [...required];
  const floorSumOf = (list: readonly SlotEntry[]) =>
    list.reduce((sum, s) => sum + floorEntry(s.entry).estimatedSec, 0);
  while (floorSumOf(survivingRequired) > politeCeiling && survivingRequired.length > 0) {
    const dropIndex = rng ? rngIndex(rng, survivingRequired.length) : survivingRequired.length - 1; // no rng given (e.g. some unit tests): drop from the tail
    survivingRequired.splice(dropIndex, 1);
  }

  // Seed every surviving required entry at its 1-set floor first, which the check above already
  // guaranteed fits collectively — so none of them can be starved out entirely by an earlier
  // survivor greedily claiming a full, untrimmed size (the risk with trying full-size-first:
  // entry A fitting at its full 3 sets can leave less room than its own floor would have, so
  // entry B ends up unable to fit even at 1 set, despite the floor check having confirmed A+B fit
  // when *both* are at floor). Then hand back whatever slack remains, one set at a time, in
  // template order — every survivor is already guaranteed a floor slot, so this only decides who
  // gets *more* than the floor, never who gets dropped.
  const requiredTargetSets = new Map(survivingRequired.map((s) => [s.entry, s.entry.sets]));
  const requiredIndices: number[] = [];
  for (const s of survivingRequired) {
    const floored = floorEntry(s.entry);
    requiredIndices.push(chosen.length);
    chosen.push(floored);
    total += floored.estimatedSec;
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < requiredIndices.length; i++) {
      const idx = requiredIndices[i];
      const current = chosen[idx];
      const targetSets = requiredTargetSets.get(survivingRequired[i].entry)!;
      if (current.sets >= targetSets) continue;
      const grownSets = current.sets + 1;
      const grownSec = estimateEntrySec({ ...current, sets: grownSets });
      const delta = grownSec - current.estimatedSec;
      if (total + delta > politeCeiling) continue;
      chosen[idx] = { ...current, sets: grownSets, estimatedSec: grownSec };
      total += delta;
      grew = true;
    }
  }

  for (const slot of optional) {
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
