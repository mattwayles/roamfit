/**
 * §5.2 selection-rule constants. Values not stated numerically in spec.md (it says "used within
 * the last N sessions" / "trailing mean" without N or a window) are taken from the prototype
 * source, since §5.2 is specified as ported verbatim from it —
 * `~/.claude/skills/daily-workout/scripts/workout_db.py` (symlinked from
 * ai-monorepo/skills/health/daily-workout). See STATUS-2-engine.md "Decisions / gotchas".
 */

/** BLOCKED: an exercise used as `main` within this many sessions ago (inclusive) is never used. */
export const HARD_COOLDOWN_SESSIONS = 2;
/** SOFT COOLDOWN: used 3..SOFT_COOLDOWN_SESSIONS sessions ago — usable only to fill a slot
 *  nothing else covers. PREFERRED: not used within the last SOFT_COOLDOWN_SESSIONS sessions. */
export const SOFT_COOLDOWN_SESSIONS = 5;

/** OVER-WORKED: a muscle's 7-day trailing set volume exceeds this multiple of the mean. */
export const OVER_WORKED_MULTIPLIER = 1.5;
export const OVER_WORKED_WINDOW_DAYS = 7;
/** UNTRAINED/LOW windows and thresholds (14-day trailing volume). */
export const TRAILING_WINDOW_DAYS = 14;
export const LOW_VOLUME_THRESHOLD_SETS = 3;

/** 48h recovery window. */
export const RECOVERY_WINDOW_DAYS = 2;

/** Enjoyment: avoid anything at or below this rating unless nothing else fills the slot. */
export const AVOID_ENJOYMENT_MAX = 2;
/** Neutral default for an exercise never rated. */
export const NEUTRAL_ENJOYMENT = 3;
/** "Favorite" = rated at or above this. */
export const FAVORITE_ENJOYMENT_MIN = 4;
/** Favorites capped at ~40% of main work. */
export const FAVORITES_CAP_RATIO = 0.4;

/** REPEATEDLY-SKIPPED: skipped or swapped away this many times → suppressed. */
export const REPEAT_SKIP_THRESHOLD = 2;
export const SUPPRESSION_DAYS = 30;

/** Session-level aggregate targets. */
export const PREFERRED_MIN_RATIO = 0.7;
export const BAND_MIN_RATIO = 0.5;

/** Warmup/cooldown light rotation window (ADR 0001) — much narrower than BLOCKED. */
export const WARMUP_COOLDOWN_ROTATION_SESSIONS = 1;
