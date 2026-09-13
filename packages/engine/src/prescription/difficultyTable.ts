/**
 * §5.4 difficulty table (formerly keyed by session "effort" — the session dial and the exercise
 * library's own `difficulty` field are now the same three-value scale, so this table's middle
 * row is `medium`, matching `Exercise.difficulty`). Several cells are stated as ranges in
 * spec.md (sets "2-3", reps "12-15", etc.) — a `SessionEntry` needs one concrete number, so this
 * file fixes a deterministic pick within each range and documents the choice
 * (STATUS-2-engine.md "Ambiguities"):
 *   - sets: rounded up from the midpoint of the range (easy 2-3 → 3, hard 3-4 → 4).
 *   - reps: the *top* of the range — consistent with §6.3's "top of the prescribed range" being
 *     the advance signal elsewhere in the engine, so a rep target always means the same thing.
 *   - `hard`'s "8-12 or AMRAP" — every `hard`-difficulty rep-metric exercise gets the numeric top
 *     (12), not AMRAP, since applying AMRAP everywhere would make every hard session's estimated
 *     time wildly unpredictable (§5.6 depends on a concrete number per exercise). The `full`
 *     template's conditioning finisher slot, the one place AMRAP used to apply, is gone (track
 *     14 — dropped by user decision, not replaced).
 */
import type { Difficulty } from '../types';

export interface DifficultyRow {
  sets: number;
  reps: number;
  restSec: number;
  tempoSec: number;
}

export const DIFFICULTY_TABLE: Record<Difficulty, DifficultyRow> = {
  easy: { sets: 3, reps: 15, restSec: 60, tempoSec: 3 },
  medium: { sets: 3, reps: 12, restSec: 45, tempoSec: 3 },
  hard: { sets: 4, reps: 12, restSec: 30, tempoSec: 4 },
};

/** §5.6 time budget's timed-exercise defaults, keyed off the exercise's own `default_seconds`
 *  rather than the reps table — the difficulty still governs sets/rest/tempo. */
export function difficultyRowFor(difficulty: Difficulty): DifficultyRow {
  return DIFFICULTY_TABLE[difficulty];
}

export interface CardioIntervalRow {
  sets: number;
  workSec: number;
  restSec: number;
}

/**
 * Track 14 — work-for-time-then-short-rest intervals for the Cardio focus, used by
 * `prescribeAccessory` in place of `DIFFICULTY_TABLE` whenever `isCardioExercise(exercise)`.
 * A cardio record's `default_seconds` (authored 30s across the library) is deliberately NOT read
 * here — the whole point of a difficulty dial for a fixed-format timed exercise is to vary how
 * long the interval runs and how much rest follows it, not to leave both fixed and vary
 * something else. Rest shortens and duration lengthens as difficulty rises, the same shape as
 * the strength table's rest column but applied to work, not just recovery.
 */
export const CARDIO_INTERVAL_TABLE: Record<Difficulty, CardioIntervalRow> = {
  easy: { sets: 3, workSec: 30, restSec: 30 },
  medium: { sets: 3, workSec: 40, restSec: 20 },
  hard: { sets: 4, workSec: 45, restSec: 15 },
};
