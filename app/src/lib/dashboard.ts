/**
 * §14.1 dashboard composition — pure functions from already-fetched store/engine data to view
 * models the screen renders. No I/O here (callers fetch, this file only shapes) and no selection/
 * prescription decisions (every number comes from an existing engine/store computation — this
 * file's only job is picking which family is the Next Unlock hero and formatting copy). Kept out
 * of `HomeScreen.tsx` so that file stays about rendering, not composing.
 */
import {
  defaultMicroForExercise,
  exerciseForLevel,
  isMaxLevel,
  levelOrdinal,
  microStepsToNextLevel,
  OVER_WORKED_MULTIPLIER,
} from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import type { sessionsRepo } from '@roamfit/store';

type DashboardSessionSummary = sessionsRepo.DashboardSessionSummary;

export interface FamilyBoardEntry {
  familyId: ProgressionFamilyId;
  familyName: string;
  ordinal: { n: number; of: number };
  exerciseName: string;
  isMastery: boolean;
  /** null once at Mastery — there is no "next" level, only the micro-ladder (§6.7). */
  sessionsToNextLevel: number | null;
  /** Qualifying sessions this level takes end to end, from its own floor. With
   *  `sessionsToNextLevel` this gives "N of M done", i.e. a progress bar. null at Mastery. */
  sessionsInLevel: number | null;
}

/**
 * ADR 0014 — the board deliberately does NOT carry the next exercise's name. Unlocking one is
 * meant to be a reveal; naming it in advance spends the payoff for nothing. Everything here is
 * about *this* rung and how far through it you are. `celebration.ts` still names the new exercise
 * at the moment it is earned, which is where that information belongs.
 */

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
    // The same count measured from this level's floor — the denominator for "N of M done". Both
    // numbers come from the engine's own micro-progression simulation, so the bar can never
    // disagree with the "sessions left" figure beside it.
    const stepsTotal = mastery
      ? null
      : microStepsToNextLevel(defaultMicroForExercise(exercise), exercise);
    out.push({
      familyId: family.id,
      familyName: family.name,
      ordinal: levelOrdinal(family, state.levelId),
      exerciseName: exercise.name,
      isMastery: mastery,
      sessionsToNextLevel: stepsRemaining,
      sessionsInLevel: stepsTotal,
    });
  }
  return out;
}

export interface NextUnlockHero {
  /** The movement function — "Horizontal Push". Deliberately the only name carried.
   *
   *  Not the exercise being unlocked (ADR 0014: that is the reveal), and not the exercise being
   *  worked now either: the current exercise is precisely the thing the unlock replaces, so
   *  headlining it dates the copy the moment the unlock lands. The pattern is true either side of
   *  the rung change, and matches how the board row below is titled, so the hero and the row
   *  visibly refer to the same thing. */
  familyName: string;
  sessionsRemaining: number;
}

/** §6.4/§14.1.3 — the single most-imminent unlock across every non-mastered family (fewest
 *  sessions remaining), which is what "the direct answer to why open tomorrow" means: one
 *  concrete, close reward, not a list. Returns null only when every family is at Mastery (the
 *  caller shows the Mastery-appropriate framing instead — never an empty Next Unlock). */
export function nextUnlockHero(board: FamilyBoardEntry[]): NextUnlockHero | null {
  const candidates = board.filter((e) => !e.isMastery && e.sessionsToNextLevel !== null);
  if (candidates.length === 0) return null;
  const closest = candidates.reduce((best, e) =>
    (e.sessionsToNextLevel as number) < (best.sessionsToNextLevel as number) ? e : best,
  );
  return {
    familyName: closest.familyName,
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
export function buildMuscleBalanceRows(
  hardSetsByMuscle14d: Record<string, number>,
): MuscleBalanceRow[] {
  const overWorked = overWorkedMuscles(hardSetsByMuscle14d);
  return Object.entries(hardSetsByMuscle14d)
    .map(([muscle, hardSets]) => ({ muscle, hardSets, overWorked: overWorked.has(muscle) }))
    .sort((a, b) => b.hardSets - a.hardSets);
}

export interface PassportSummary {
  cities: string[];
  countries: string[];
  sessionsAbroad: number;
}

/** §9.6 Passport — city/country **strings only**, deduplicated, counted. `sessionsAbroad` is
 *  simply "sessions with a city pinned" (v1 has no notion of a fixed "home" city to compare
 *  against — every pin is itself a positive, accumulating record, never a judgment about which
 *  ones "count"). */
export function buildPassportSummary(sessions: DashboardSessionSummary[]): PassportSummary {
  const cities = new Set<string>();
  const countries = new Set<string>();
  let sessionsAbroad = 0;
  for (const s of sessions) {
    if (s.city) {
      cities.add(s.city);
      sessionsAbroad += 1;
    }
    if (s.country) countries.add(s.country);
  }
  return { cities: [...cities], countries: [...countries], sessionsAbroad };
}

export interface CalendarDay {
  localDate: string;
  /** null = untrained (neutral, never red/empty per §14.1.6/§1.1). */
  minutes: number | null;
}

/** §14.1.6 calendar heatmap — the trailing `days`-day window ending today, one entry per
 *  calendar day (including untrained ones, so the caller can render them neutrally rather than
 *  simply omitting them, which would look like a gap). */
export function buildCalendarDays(
  sessions: DashboardSessionSummary[],
  today: string,
  days: number,
): CalendarDay[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    const minutes = s.actualMinutes ?? s.estimatedMinutes;
    byDate.set(s.localDate, (byDate.get(s.localDate) ?? 0) + minutes);
  }
  const [y, m, d] = today.split('-').map(Number);
  const out: CalendarDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(y, m - 1, d - i));
    const localDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    out.push({ localDate, minutes: byDate.get(localDate) ?? null });
  }
  return out;
}

export interface LifetimeCounters {
  sessions: number;
  totalMinutes: number;
  cities: number;
  countries: number;
  levelsGained: number;
  bestSets: number;
}

/** §14.1.8 — every field here is monotonic and permanent, per the wave's governing rule. Takes
 *  already-fetched milestone-type counts and the passport summary rather than re-deriving them,
 *  so this stays a pure composition step over data the caller already has in hand. */
export function buildLifetimeCounters(
  lifetimeSessionCount: number,
  lifetimeTotalMinutes: number,
  passport: PassportSummary,
  levelUpMilestoneCount: number,
  bestSetMilestoneCount: number,
): LifetimeCounters {
  return {
    sessions: lifetimeSessionCount,
    totalMinutes: Math.round(lifetimeTotalMinutes),
    cities: passport.cities.length,
    countries: passport.countries.length,
    levelsGained: levelUpMilestoneCount,
    bestSets: bestSetMilestoneCount,
  };
}
