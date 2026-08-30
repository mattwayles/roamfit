/**
 * §4.4 User Exercise State repository — per user × exercise, never on the shared library table
 * (invariant 7). Also owns the EMA update formulas for §8.1 explicit feedback, since "how a
 * rating turns into a stored trend" is a storage-layer decision the engine doesn't make (it only
 * ever *reads* `ExerciseState.difficultyEma`/`enjoymentEma`).
 */
import { eq, and } from 'drizzle-orm';
import type {
  BandId,
  DifficultyFeedback,
  ExerciseState as EngineExerciseState,
} from '@roamfit/engine';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

/** Not specified numerically in spec.md (§8.1/§4.4 name the fields, not the smoothing constant).
 *  0.3 gives a rating meaningful weight within 2-3 sessions without one outlier dominating —
 *  documented here, not silently guessed, per CLAUDE.md's ADR rule (this is a small enough
 *  numeric choice to record inline rather than a full ADR, mirroring how the engine's own
 *  progression/constants.ts handles similar unstated numbers). */
export const EMA_ALPHA = 0.3;

const DIFFICULTY_VALUE: Record<DifficultyFeedback, number> = {
  too_easy: 1,
  just_right: 0,
  too_hard: -1,
};

function ema(prev: number, value: number, alpha = EMA_ALPHA): number {
  return prev + alpha * (value - prev);
}

function rowToState(row: typeof schema.exerciseState.$inferSelect): EngineExerciseState {
  return {
    exerciseId: row.exerciseId,
    lastPerformedAt: row.lastPerformedAt,
    sessionsPerformed: row.sessionsPerformed,
    bestSet:
      row.bestSetAt && (row.bestSetReps != null || row.bestSetSeconds != null)
        ? {
            reps: row.bestSetReps ?? undefined,
            seconds: row.bestSetSeconds ?? undefined,
            band: (row.bestSetBand as BandId | null) ?? undefined,
            at: row.bestSetAt,
          }
        : null,
    difficultyEma: row.difficultyEma,
    enjoymentEma: row.enjoymentEma,
    skipCount: row.skipCount,
    swapAwayCount: row.swapAwayCount,
    removeAtApprovalCount: row.removeAtApprovalCount,
    pinnedNote: row.pinnedNote,
    suppressedUntil: row.suppressedUntil,
  };
}

export function getExerciseState(db: Db, exerciseId: string): EngineExerciseState | null {
  const rows = db
    .select()
    .from(schema.exerciseState)
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .all();
  return rows.length > 0 ? rowToState(rows[0]) : null;
}

export function getAllExerciseStates(db: Db): Record<string, EngineExerciseState> {
  const rows = db
    .select()
    .from(schema.exerciseState)
    .where(eq(schema.exerciseState.userId, USER_ID))
    .all();
  const out: Record<string, EngineExerciseState> = {};
  for (const row of rows) out[row.exerciseId] = rowToState(row);
  return out;
}

function ensureRow(db: Db, exerciseId: string, now: string): void {
  const existing = db
    .select()
    .from(schema.exerciseState)
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .all();
  if (existing.length === 0) {
    db.insert(schema.exerciseState).values({ userId: USER_ID, exerciseId, updatedAt: now }).run();
  }
}

/** Called at completion for every exercise that actually ran (§4.4's counters describe usage,
 *  not planning). `bestPerformance` is the best single-set result actually logged this session
 *  for this exercise, if any — reps/seconds, whichever the exercise's metric uses. */
export function recordExercisePerformed(
  db: Db,
  exerciseId: string,
  input: {
    localDate: string;
    bestPerformance?: { reps?: number; seconds?: number; band?: BandId | null };
  },
  now: string,
): { improvedBestSet: boolean } {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;

  let improvedBestSet = false;
  let bestSetReps = state.bestSet?.reps ?? null;
  let bestSetSeconds = state.bestSet?.seconds ?? null;
  let bestSetBand = state.bestSet?.band ?? null;
  let bestSetAt = state.bestSet?.at ?? null;

  const perf = input.bestPerformance;
  if (perf) {
    const currentReps = state.bestSet?.reps ?? -Infinity;
    const currentSeconds = state.bestSet?.seconds ?? -Infinity;
    const better =
      (perf.reps !== undefined && perf.reps > currentReps) ||
      (perf.seconds !== undefined && perf.seconds > currentSeconds);
    if (better) {
      improvedBestSet = state.bestSet !== null; // a *first-ever* set is not an "improvement" PR
      bestSetReps = perf.reps ?? null;
      bestSetSeconds = perf.seconds ?? null;
      bestSetBand = perf.band ?? null;
      bestSetAt = input.localDate;
    }
  }

  db.update(schema.exerciseState)
    .set({
      lastPerformedAt: input.localDate,
      sessionsPerformed: state.sessionsPerformed + 1,
      bestSetReps,
      bestSetSeconds,
      bestSetBand,
      bestSetAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();

  return { improvedBestSet };
}

export function recordDifficultyFeedback(
  db: Db,
  exerciseId: string,
  feedback: DifficultyFeedback,
  now: string,
): void {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;
  db.update(schema.exerciseState)
    .set({ difficultyEma: ema(state.difficultyEma, DIFFICULTY_VALUE[feedback]), updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

export function recordEnjoymentFeedback(
  db: Db,
  exerciseId: string,
  rating: number,
  now: string,
): void {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;
  db.update(schema.exerciseState)
    .set({ enjoymentEma: ema(state.enjoymentEma, rating), updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

export function incrementSkipCount(db: Db, exerciseId: string, now: string): void {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;
  db.update(schema.exerciseState)
    .set({ skipCount: state.skipCount + 1, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

export function incrementSwapAwayCount(db: Db, exerciseId: string, now: string): void {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;
  db.update(schema.exerciseState)
    .set({ swapAwayCount: state.swapAwayCount + 1, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

export function incrementRemoveAtApprovalCount(db: Db, exerciseId: string, now: string): void {
  ensureRow(db, exerciseId, now);
  const state = getExerciseState(db, exerciseId)!;
  db.update(schema.exerciseState)
    .set({ removeAtApprovalCount: state.removeAtApprovalCount + 1, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

/** §8.2 — persists instantly, shown verbatim. `null` clears the note. */
export function setPinnedNote(db: Db, exerciseId: string, note: string | null, now: string): void {
  ensureRow(db, exerciseId, now);
  db.update(schema.exerciseState)
    .set({ pinnedNote: note, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}

/** §5.2 REPEATEDLY-SKIPPED / §13.2 pain-report suppression. */
export function setSuppressedUntil(
  db: Db,
  exerciseId: string,
  until: string | null,
  now: string,
): void {
  ensureRow(db, exerciseId, now);
  db.update(schema.exerciseState)
    .set({ suppressedUntil: until, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}
