/**
 * §6 progression constants. Several numeric choices are NOT stated in spec.md and are resolved
 * here as explicit decisions (see STATUS-2-engine.md "Ambiguities" for the reasoning), not
 * silently guessed:
 *
 * - The rep/hold range a family's micro-progression climbs through takes its rest/tempo/sets
 *   baseline from the §5.4 **`medium`** difficulty row (rest 45s, tempo 3s/rep, sets 3) — not
 *   `easy` or `hard`. The session's requested difficulty is "for today," while progression is a
 *   property of the level, so progression needs a difficulty-independent baseline, and `medium`'s
 *   numbers are also exactly the schema's implied micro defaults.
 * - The rep range itself is 8-12, which is deliberately *wider at the bottom* than `medium`'s
 *   10-12. A freshly-entered level is prescribed the bottom of the range, and the whole point of
 *   entering a level is that the movement is new and harder than the one below it — starting that
 *   at 10 asks for the level's hardest honest rep count on day one. 8 gives a level somewhere to
 *   climb from.
 * - Timed (`metric: 'time'`) exercises use a separate seconds range, since a 10-12 rep window
 *   makes no sense as a hold time. Chosen as a generic 20-45s working hold range.
 * - Bodyweight micro-progression's tempo/rest/sets caps (how far each knob ratchets before the
 *   sequence is exhausted and a level change is due) are not given numerically either; chosen as
 *   one increment each (tempo 3s→4s, rest 45s→30s, sets 3→4) to match §6.2's *linear* wording
 *   ("reps → top → tempo +1s → rest −15s → sets +1 → next level" reads as one pass through each
 *   knob, not a repeating cycle).
 */

export const PROGRESSION_REP_LOW = 8;
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
/** Deliberately absent: an "exceeded the rep target by ≥25%" calibration jump. Reps are a
 *  prescription to be met, not a score to beat — the user does the prescribed reps if able and
 *  fewer if not, so there is no such thing as a session that earned something by going over.
 *  Calibration advances on `too_easy` alone; the ordinary ladder advances on meeting the
 *  prescription. */
/** Retired by ADR 0012 — the cold start is level 1, not a percentile guess. Kept out of the
 *  ladder entirely rather than set to 0, so nothing reintroduces a "start them partway up" seed
 *  without reading the ADR first. */

/** Product call, not derived: when a laddered slot has eligible exercises at both the current
 *  rung and at least one rung below it, this is the chance the current rung is drawn. Keeps
 *  progressive overload the dominant signal while still surfacing mastered exercises regularly
 *  rather than only as a last-resort fallback. */
export const CURRENT_RUNG_WEIGHT = 0.6;

/** §9.4 comeback thresholds. */
export const COMEBACK_WEEK_GAP_DAYS = 7;
export const COMEBACK_RESET_GAP_DAYS = 21;
/** §9.4 — cuts volume ~20% for the comeback (and, per §9.9, Recovery Week) session. */
export const COMEBACK_VOLUME_MULTIPLIER = 0.8;
