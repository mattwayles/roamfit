/**
 * §14.1 dashboard composition — pure functions from already-fetched store/engine data to view
 * models the screen renders. No I/O here (callers fetch, this file only shapes) and no selection/
 * prescription decisions (every number comes from an existing engine/store computation — this
 * file's only job is picking which family is the Next Unlock hero and formatting copy). Kept out
 * of `HomeScreen.tsx` so that file stays about rendering, not composing.
 */
import {
  exerciseForLevel,
  findFamily,
  isMaxLevel,
  levelOrdinal,
  microStepsToNextLevel,
  OVER_WORKED_MULTIPLIER,
} from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';

export interface FamilyBoardEntry {
  familyId: ProgressionFamilyId;
  familyName: string;
  ordinal: { n: number; of: number };
  exerciseName: string;
  isMastery: boolean;
  /** null once at Mastery — there is no "next" level, only the micro-ladder (§6.7). */
  sessionsToNextLevel: number | null;
  nextExerciseName: string | null;
}

/** §14.1.4 progression board — every family, in the families JSON's own order (stable, not
 *  re-sorted by "how close" — a board that reorders itself session to session would be harder to
 *  scan, not more motivating). Every family with a `progressionState` row is shown; a family with
 *  none yet (shouldn't happen once `ensureProgressionStatesInitialized` has run, but defensive
 *  for a screen that renders before that call resolves) is simply omitted rather than shown with
 *  fabricated data. */
export function buildProgressionBoard(
  library: ExerciseLibrary,
  families: FamilyLibrary,
  states: Record<ProgressionFamilyId, ProgressionState>,
): FamilyBoardEntry[] {
  const out: FamilyBoardEntry[] = [];
  for (const family of families.families) {
    const state = states[family.id];
    if (!state) continue;
    const exercise = exerciseForLevel(family, state.levelId, library.exercises);
    if (!exercise) continue;
    const mastery = isMaxLevel(family, state.levelId);
    const stepsRemaining = mastery ? null : microStepsToNextLevel(state.micro, exercise);
    const idx = family.levels.findIndex((l) => l.level_id === state.levelId);
    const nextLevel = !mastery && idx >= 0 ? family.levels[idx + 1] : undefined;
    const nextExercise = nextLevel
      ? exerciseForLevel(family, nextLevel.level_id, library.exercises)
      : undefined;
    out.push({
      familyId: family.id,
      familyName: family.name,
      ordinal: levelOrdinal(family, state.levelId),
      exerciseName: exercise.name,
      isMastery: mastery,
      sessionsToNextLevel: stepsRemaining,
      nextExerciseName: nextExercise?.name ?? null,
    });
  }
  return out;
}

export interface NextUnlockHero {
  familyName: string;
  exerciseName: string;
  nextExerciseName: string;
  sessionsRemaining: number;
}

/** §6.4/§14.1.3 — the single most-imminent unlock across every non-mastered family (fewest
 *  sessions remaining), which is what "the direct answer to why open tomorrow" means: one
 *  concrete, close reward, not a list. Returns null only when every family is at Mastery (the
 *  caller shows the Mastery-appropriate framing instead — never an empty Next Unlock). */
export function nextUnlockHero(board: FamilyBoardEntry[]): NextUnlockHero | null {
  const candidates = board.filter(
    (e) => !e.isMastery && e.sessionsToNextLevel !== null && e.nextExerciseName !== null,
  );
  if (candidates.length === 0) return null;
  const closest = candidates.reduce((best, e) =>
    (e.sessionsToNextLevel as number) < (best.sessionsToNextLevel as number) ? e : best,
  );
  return {
    familyName: closest.familyName,
    exerciseName: closest.exerciseName,
    nextExerciseName: closest.nextExerciseName as string,
    sessionsRemaining: closest.sessionsToNextLevel as number,
  };
}

/** §14.1.7 muscle balance — flags over-worked muscles using the same 1.5x-trailing-mean rule
 *  §5.2 applies at generation, but read from the already-rolled-up 14-day ledger (no history
 *  rescan). Purely informational per §1.1/§14.1.7 — the caller must style this exactly like every
 *  other row, never a warning color. */
export function overWorkedMuscles(hardSetsByMuscle14d: Record<string, number>): Set<string> {
  const values = Object.values(hardSetsByMuscle14d);
  if (values.length === 0) return new Set();
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return new Set(
    Object.entries(hardSetsByMuscle14d)
      .filter(([, v]) => v > OVER_WORKED_MULTIPLIER * mean)
      .map(([m]) => m),
  );
}

export interface MuscleBalanceRow {
  muscle: string;
  hardSets: number;
  overWorked: boolean;
}

/** Sorted descending by volume — the biggest bars first reads more like "here's what's been
 *  worked" than an alphabetical list, and is stable within a render (no re-sort mid-scroll). */
export function buildMuscleBalanceRows(hardSetsByMuscle14d: Record<string, number>): MuscleBalanceRow[] {
  const overWorked = overWorkedMuscles(hardSetsByMuscle14d);
  return Object.entries(hardSetsByMuscle14d)
    .map(([muscle, hardSets]) => ({ muscle, hardSets, overWorked: overWorked.has(muscle) }))
    .sort((a, b) => b.hardSets - a.hardSets);
}
