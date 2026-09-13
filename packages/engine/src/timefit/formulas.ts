/**
 * §5.6 time budget — the pure arithmetic, shared by prescription (per-entry `estimatedSec`) and
 * the time-fit stage (which sums entries against the target and adds/drops until within ±10%).
 */

/** ADR 0002 — below this, the warmup(3min)+cooldown(3min) floors alone consume 6 of the
 *  requested minutes, which no selection/prescription lever can reconcile with the required
 *  pattern slots a full template still demands. `pipeline.ts`'s general (non-Quick-Session) path
 *  clamps up to this floor. §9.5 Quick Session doesn't use this budget path at all. */
export const MINIMUM_SUPPORTED_TARGET_MINUTES = 15;

export function warmupMinutes(targetMinutes: number): number {
  return clamp(Math.round(0.12 * targetMinutes), 3, 8);
}

export function cooldownMinutes(targetMinutes: number): number {
  return clamp(Math.round(0.1 * targetMinutes), 3, 7);
}

export function mainBudgetSec(targetMinutes: number): number {
  return (targetMinutes - warmupMinutes(targetMinutes) - cooldownMinutes(targetMinutes)) * 60;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high);
}

/** Real-world time to close out one exercise and get set up for the next: re-reading the next
 *  movement, changing bands/handles, finding the right anchor point and tension. Flat regardless
 *  of anchor changes — a user who needs more than this can pause the workout timer. */
const TRANSITION_BUFFER_SEC = 60;

/** Straight-set rep-based exercise. */
export function repExerciseSec(params: {
  sets: number;
  reps: number;
  tempoSec: number;
  restSec: number;
  unilateral: boolean;
}): number {
  const workSec = params.reps * params.tempoSec * (params.unilateral ? 2 : 1);
  const setSec = workSec + params.restSec;
  return params.sets * setSec + TRANSITION_BUFFER_SEC;
}

/** Timed exercise (§5.6: `sets × (duration_sec + rest_sec) + transition buffer`, ×2 if unilateral). */
export function timedExerciseSec(params: {
  sets: number;
  durationSec: number;
  restSec: number;
  unilateral: boolean;
}): number {
  const perSet = params.durationSec + params.restSec;
  const base = params.sets * perSet * (params.unilateral ? 2 : 1);
  return base + TRANSITION_BUFFER_SEC;
}

/**
 * §5.6 exercise-count sanity check: [min, max] main exercises for a target length.
 *
 * ADR 0013 added the two tiers above 60 minutes. §5.6's table stopped at "> 45 → [8, 10]", which
 * meant a 90- or 120-minute request produced exactly the same session as 60 and reported
 * `template_exhausted`. The tiers stay deliberately conservative — see
 * `longSessionSetsMultiplier`, which is where most of the extra time in a long session comes
 * from. Filling 120 minutes with exercise count alone would need ~25 movements, which is what
 * this sanity check exists to prevent.
 */
export function mainExerciseCountRange(targetMinutes: number): [number, number] {
  if (targetMinutes <= 15) return [3, 4];
  if (targetMinutes <= 20) return [4, 5];
  if (targetMinutes <= 30) return [5, 6];
  if (targetMinutes <= 45) return [7, 8];
  if (targetMinutes <= 60) return [8, 10];
  if (targetMinutes <= 90) return [10, 14];
  return [12, 16];
}

/**
 * Track 14 — the Cardio focus's own exercise-count sanity range, used in place of
 * `mainExerciseCountRange` wherever the pipeline reads it for a cardio session (the
 * `expandOptionalSlots` ceiling, and `fitMainEntries`' own sanity check). A cardio interval
 * (`CARDIO_INTERVAL_TABLE`: ~60-90s per set including rest, a few sets) runs well under the ~5min
 * a strength accessory's 3 sets of 8-12 reps plus rest typically takes, so the general table's
 * tiers would cap a cardio session's main work far short of its time budget — reported, correctly
 * but needlessly, as `template_exhausted` every time. Higher at every tier, same shape, same
 * `EXPANSION_HARD_CAP` outer ceiling; `longSessionSetsMultiplier` still supplies the 90-120min
 * extra on top, same as it does for a strength focus. Tuned against `pipeline.test.ts`'s
 * 15/30/60/120min fit tests, not derived from a formula — same footing as the general table's own
 * ADR 0013 tiers.
 */
export function cardioMainExerciseCountRange(targetMinutes: number): [number, number] {
  if (targetMinutes <= 15) return [3, 5];
  if (targetMinutes <= 20) return [4, 6];
  if (targetMinutes <= 30) return [6, 8];
  if (targetMinutes <= 45) return [8, 11];
  if (targetMinutes <= 60) return [11, 14];
  if (targetMinutes <= 90) return [12, 18];
  return [14, 18];
}

/**
 * ADR 0013 — extra volume per exercise for a long session, multiplied into every entry's set
 * count (the same `setsMultiplier` lever §9.4's comeback cut uses, in the opposite direction).
 *
 * A two-hour session is not a 30-minute session with four times the exercises; it is the same
 * movements carried further. Adding time by set count rather than by exercise count keeps the
 * session coherent, keeps it inside the §5.6 count sanity range, and means the extra time lands
 * on work the user's progression state actually knows about.
 *
 * Returns 1 below 60 minutes, so nothing about existing session lengths changes.
 */
export function longSessionSetsMultiplier(targetMinutes: number): number {
  if (targetMinutes <= 60) return 1;
  if (targetMinutes <= 90) return 1.5;
  return 2;
}
