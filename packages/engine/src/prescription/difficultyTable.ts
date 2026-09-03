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
 *   - `hard`'s "8-12 or AMRAP" — AMRAP is reserved for the `full` template's conditioning
 *     finisher slot (§5.5: "supersets + one finisher" at `hard`); every other `hard`-difficulty
 *     rep-metric exercise gets the numeric top (12), not AMRAP, since applying AMRAP everywhere
 *     would make every hard session's estimated time wildly unpredictable (§5.6 depends on a
 *     concrete number per exercise).
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
