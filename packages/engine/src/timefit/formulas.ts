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
 *  movement, changing bands/handles, finding the right anchor point and tension. Feedback from
 *  generated sessions showed the old 30s flat buffer badly undercounted this — 30s barely covers
 *  putting one band down, let alone the anchor search. `anchorRebuild` scales the same buffer up
 *  further for exercises that also require moving to a different anchor point entirely. */
const TRANSITION_BUFFER_SEC = 120;
const ANCHOR_REBUILD_BUFFER_SEC = 180;

/** Straight-set rep-based exercise. */
export function repExerciseSec(params: {
  sets: number;
  reps: number;
  tempoSec: number;
  restSec: number;
  unilateral: boolean;
  anchorRebuild?: boolean;
}): number {
  const workSec = params.reps * params.tempoSec * (params.unilateral ? 2 : 1);
  const setSec = workSec + params.restSec;
  return params.sets * setSec + (params.anchorRebuild ? ANCHOR_REBUILD_BUFFER_SEC : TRANSITION_BUFFER_SEC);
}

/** Timed exercise (§5.6: `sets × (duration_sec + rest_sec) + transition buffer`, ×2 if unilateral). */
export function timedExerciseSec(params: {
  sets: number;
  durationSec: number;
  restSec: number;
  unilateral: boolean;
  anchorRebuild?: boolean;
}): number {
  const perSet = params.durationSec + params.restSec;
  const base = params.sets * perSet * (params.unilateral ? 2 : 1);
  return base + (params.anchorRebuild ? ANCHOR_REBUILD_BUFFER_SEC : TRANSITION_BUFFER_SEC);
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
