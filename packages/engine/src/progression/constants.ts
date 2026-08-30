/**
 * §6 progression constants. Several numeric choices are NOT stated in spec.md and are resolved
 * here as explicit decisions (see STATUS-2-engine.md "Ambiguities" for the reasoning), not
 * silently guessed:
 *
 * - The rep/hold range a family's micro-progression climbs through is the §5.4 **`normal`**
 *   effort row (sets 3, reps 10-12, rest 45s, tempo 3s/rep) — not `easy` or `hard`. §5.4 is
 *   explicit that effort is "for today," while progression is a property of the level, so
 *   progression needs an effort-independent baseline, and `normal`'s numbers are also exactly
 *   the schema's implied micro defaults (rest 45s, tempo 3s, sets 3).
 * - Timed (`metric: 'time'`) exercises use a separate seconds range, since a 10-12 rep window
 *   makes no sense as a hold time. Chosen as a generic 20-45s working hold range.
 * - Bodyweight micro-progression's tempo/rest/sets caps (how far each knob ratchets before the
 *   sequence is exhausted and a level change is due) are not given numerically either; chosen as
 *   one increment each (tempo 3s→4s, rest 45s→30s, sets 3→4) to match §6.2's *linear* wording
 *   ("reps → top → tempo +1s → rest −15s → sets +1 → next level" reads as one pass through each
 *   knob, not a repeating cycle).
 */

export const PROGRESSION_REP_LOW = 10;
export const PROGRESSION_REP_HIGH = 12;

export const PROGRESSION_TIME_LOW_SEC = 20;
export const PROGRESSION_TIME_HIGH_SEC = 45;

export const DEFAULT_TEMPO_SEC = 3;
export const DEFAULT_REST_SEC = 45;
export const DEFAULT_SETS = 3;

export const BODYWEIGHT_TEMPO_CAP_SEC = 4;
export const BODYWEIGHT_REST_FLOOR_SEC = 30;
export const BODYWEIGHT_SETS_CAP = 4;

/** §6.3 — two consecutive sessions at the bottom micro-step that would still regress further
 *  drops a full level instead. */
export const CONSECUTIVE_BOTTOM_REGRESSIONS_TO_DROP_LEVEL = 2;

/** §6.5 — calibration mode runs for exactly the first 3 sessions of a family (spec: "converges
 *  in two or three sessions" — a session that neither advances nor drops still counts toward
 *  this, since nothing else is specified to end it early). */
export const CALIBRATION_SESSIONS = 3;
/** §6.5 — "exceeding the rep target by ≥25%" advances a full level during calibration. */
export const CALIBRATION_OVERSHOOT_RATIO = 0.25;
/** §6.5 — every family starts at ~30th percentile of its ladder. */
export const CALIBRATION_START_PERCENTILE = 0.3;

/** §9.4 comeback thresholds. */
export const COMEBACK_WEEK_GAP_DAYS = 7;
export const COMEBACK_RESET_GAP_DAYS = 21;
/** §9.4 — cuts volume ~20% for the comeback (and, per §9.9, Recovery Week) session. */
export const COMEBACK_VOLUME_MULTIPLIER = 0.8;
