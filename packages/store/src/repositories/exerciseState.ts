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
import { logSignalEvent } from './signals';

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
/** §8.2 persists instantly; §8.3 "pinned note created or edited" is also an implicit signal —
 *  logged here as `pinned_note_created` (no prior note) or `pinned_note_edited` (had one),
 *  distinct from the note content itself (which lives verbatim on the row, shown every time). */
export function setPinnedNote(
  db: Db,
  exerciseId: string,
  note: string | null,
  now: string,
  localDate: string,
): void {
  ensureRow(db, exerciseId, now);
  const before = getExerciseState(db, exerciseId);
  db.update(schema.exerciseState)
    .set({ pinnedNote: note, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
  if (note !== null) {
    logSignalEvent(db, {
      sessionId: null,
      type: before?.pinnedNote ? 'pinned_note_edited' : 'pinned_note_created',
      payload: { exerciseId },
      utcInstant: now,
      localDate,
    });
  }
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

// ------------------------------------------------------------------------------------------
// §11.4 media-ladder link health — local half of "two reports demote to tier 2". See the
// `video_flag_count`/`video_demoted_at` columns' comments in schema.ts for why this lives here
// rather than a new table, and STATUS-6b-media-ladder.md for why user reports and automatic
// player-error flags share one counter.
// ------------------------------------------------------------------------------------------

const VIDEO_DEMOTION_THRESHOLD = 2;

export type VideoFlagSource = 'user_report' | 'player_error';

export interface VideoFlagState {
  flagCount: number;
  demoted: boolean;
  demotedAt: string | null;
}

function rowToVideoFlagState(row: {
  videoFlagCount: number;
  videoDemotedAt: string | null;
}): VideoFlagState {
  return {
    flagCount: row.videoFlagCount,
    demoted: row.videoDemotedAt !== null,
    demotedAt: row.videoDemotedAt,
  };
}

/** Read-only — never throws, never inserts a row (an exercise with no state yet has never been
 *  flagged, so the safe default is "not demoted"). Callers resolving the media ladder should use
 *  this rather than `getExerciseState`, which only surfaces the `@roamfit/engine`-shaped fields. */
export function getVideoFlagState(db: Db, exerciseId: string): VideoFlagState {
  const rows = db
    .select({
      videoFlagCount: schema.exerciseState.videoFlagCount,
      videoDemotedAt: schema.exerciseState.videoDemotedAt,
    })
    .from(schema.exerciseState)
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .all();
  return rows.length > 0
    ? rowToVideoFlagState(rows[0])
    : { flagCount: 0, demoted: false, demotedAt: null };
}

/** §11.4: "A one-tap 'this video is wrong or broken' sits under the player. Two reports demote
 *  the exercise to tier 2 automatically." Also called for an automatic player-error flag (source
 *  `'player_error'`) — see the file-header note on why the two share one counter. Idempotent past
 *  the threshold: once demoted, further reports keep incrementing the count (useful context for a
 *  future operator review) but never move `demotedAt`. */
export function reportVideoIssue(
  db: Db,
  exerciseId: string,
  source: VideoFlagSource,
  now: string,
  localDate: string,
): VideoFlagState {
  ensureRow(db, exerciseId, now);
  const before = getVideoFlagState(db, exerciseId);
  const nextCount = before.flagCount + 1;
  const nowDemoting = !before.demoted && nextCount >= VIDEO_DEMOTION_THRESHOLD;
  const nextDemotedAt = before.demoted ? before.demotedAt : nowDemoting ? now : null;

  db.update(schema.exerciseState)
    .set({ videoFlagCount: nextCount, videoDemotedAt: nextDemotedAt, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();

  logSignalEvent(db, {
    sessionId: null,
    type: 'video_flag_reported',
    payload: { exerciseId, source, flagCount: nextCount, demoted: nextDemotedAt !== null },
    utcInstant: now,
    localDate,
  });

  return { flagCount: nextCount, demoted: nextDemotedAt !== null, demotedAt: nextDemotedAt };
}

// ------------------------------------------------------------------------------------------
// §11.4 / ADR 0009 — user-assigned demo video.
// ------------------------------------------------------------------------------------------

/** Read-only, never inserts. NULL/absent row both mean "the user has not assigned one," which is
 *  the correct default for an exercise never opened. */
export function getUserVideoId(db: Db, exerciseId: string): string | null {
  const rows = db
    .select({ userVideoId: schema.exerciseState.userVideoId })
    .from(schema.exerciseState)
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .all();
  return rows.length > 0 ? (rows[0].userVideoId ?? null) : null;
}

/**
 * Assign (or replace) the user's own demo video for this exercise.
 *
 * Takes an already-parsed **video id**, never a URL — parsing and validation are the caller's job
 * (`parseYouTubeVideoId` in the app layer), so a malformed paste can never reach storage or the
 * embed builder. This does not violate invariant 8: the id is supplied by the user from a real
 * video they are looking at, never recalled or constructed by the app.
 *
 * Assigning also clears any existing demotion for this exercise. A demotion means "the video that
 * was here was wrong or broken" — that judgment does not carry over to a different video the user
 * deliberately picked, and leaving it set would make the new assignment silently invisible.
 */
export function assignUserVideo(
  db: Db,
  exerciseId: string,
  videoId: string,
  now: string,
  localDate: string,
): void {
  ensureRow(db, exerciseId, now);
  db.update(schema.exerciseState)
    .set({
      userVideoId: videoId,
      userVideoAssignedAt: now,
      videoFlagCount: 0,
      videoDemotedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();

  logSignalEvent(db, {
    sessionId: null,
    type: 'user_video_assigned',
    payload: { exerciseId, videoId },
    utcInstant: now,
    localDate,
  });
}

/** Remove the user's assignment, falling back to whatever the curated remote config offers (which
 *  may be nothing). Does not restore a cleared flag count — see `assignUserVideo`. */
export function clearUserVideo(db: Db, exerciseId: string, now: string): void {
  db.update(schema.exerciseState)
    .set({ userVideoId: null, userVideoAssignedAt: null, updatedAt: now })
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .run();
}
