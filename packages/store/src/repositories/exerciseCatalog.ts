/**
 * The two reads the Exercises page needs, kept here rather than in `app/` because everything on
 * this page is a query over `exercise_state`, `remote_video_config`, `sessions`, `session_entries`
 * and `set_logs` — and `app/` writes no queries (ADR 0003 / CLAUDE.md's "no new persistence logic
 * in app/").
 *
 * Both are synchronous local SQLite reads with no network on the path: the catalogue, its filters,
 * and the per-exercise progression chart all work in airplane mode (invariant 1).
 *
 * Nothing here counts anything new. "Times completed" is `exercise_state.sessions_performed`,
 * which `completion.ts` increments once per session in which at least one set of that exercise was
 * actually completed — precisely "completed in tracked workout history". A second counter would be
 * a second truth.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { BAND_ORDER } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

// ------------------------------------------------------------------------------------------
// Catalogue state — the per-exercise facts the list cards and the filters need.
// ------------------------------------------------------------------------------------------

export interface ExerciseCatalogState {
  /** Sessions in which at least one set of this exercise was completed. */
  timesCompleted: number;
  lastPerformedAt: string | null;
  /** ADR 0009 — the video the user assigned themselves, or null. */
  userVideoId: string | null;
  /** §11.4 — the curated remote-config id, or null. Never bundled (invariant 8). */
  curatedVideoId: string | null;
  /**
   * Backs the "still needs a YouTube link" filter. True when *either* source can supply a video,
   * because either one is enough for the media ladder to show a player — an exercise with a
   * curated id does not need a link pasted for it.
   */
  hasVideo: boolean;
  /** Explicit, permanent user veto (Exercises detail screen or the workout approval screen) —
   *  distinct from `exercise_state.suppressed_until`'s temporary, system-managed cooldown. */
  disabled: boolean;
}

const EMPTY_STATE: ExerciseCatalogState = {
  timesCompleted: 0,
  lastPerformedAt: null,
  userVideoId: null,
  curatedVideoId: null,
  hasVideo: false,
  disabled: false,
};

/** The state for an exercise with no rows anywhere — never performed, no video. Exported so the
 *  screen can render a library exercise the user has never touched without special-casing. */
export function emptyCatalogState(): ExerciseCatalogState {
  return { ...EMPTY_STATE };
}

/**
 * One pass over both tables for the whole library, keyed by exercise id. Two full-table reads
 * rather than 219 per-exercise lookups: `exercise_state` and `remote_video_config` are both
 * bounded by the size of the bundled library, so this is the cheap shape, and it is what makes
 * the list render (and its filters recompute) without touching the db per card.
 *
 * Ids absent from the result have simply never been performed and have no video — use
 * `emptyCatalogState()`.
 */
export function getExerciseCatalogState(db: Db): Record<string, ExerciseCatalogState> {
  const out: Record<string, ExerciseCatalogState> = {};

  const stateRows = db
    .select({
      exerciseId: schema.exerciseState.exerciseId,
      sessionsPerformed: schema.exerciseState.sessionsPerformed,
      lastPerformedAt: schema.exerciseState.lastPerformedAt,
      userVideoId: schema.exerciseState.userVideoId,
      disabledAt: schema.exerciseState.disabledAt,
    })
    .from(schema.exerciseState)
    .where(eq(schema.exerciseState.userId, USER_ID))
    .all();

  for (const row of stateRows) {
    out[row.exerciseId] = {
      ...EMPTY_STATE,
      timesCompleted: row.sessionsPerformed,
      lastPerformedAt: row.lastPerformedAt,
      userVideoId: row.userVideoId ?? null,
      hasVideo: row.userVideoId != null,
      disabled: row.disabledAt != null,
    };
  }

  const configRows = db
    .select({
      exerciseId: schema.remoteVideoConfig.exerciseId,
      videoId: schema.remoteVideoConfig.videoId,
    })
    .from(schema.remoteVideoConfig)
    .all();

  for (const row of configRows) {
    const existing = out[row.exerciseId] ?? { ...EMPTY_STATE };
    out[row.exerciseId] = {
      ...existing,
      curatedVideoId: row.videoId ?? null,
      hasVideo: existing.userVideoId != null || row.videoId != null,
    };
  }

  return out;
}

// ------------------------------------------------------------------------------------------
// Per-exercise performance history — the substrate for the detail page's progression chart.
// ------------------------------------------------------------------------------------------

export interface ExerciseSessionPerformance {
  sessionId: string;
  /** invariant 6 — the session's own `local_date`, never derived from a UTC instant. */
  localDate: string;
  /** Sets of this exercise actually completed in that session (skipped sets don't count). */
  setsCompleted: number;
  /** Best single completed set, in whichever unit the sets were logged in. Null when none was. */
  bestReps: number | null;
  bestSeconds: number | null;
  /** Summed across completed sets — the volume term, which can rise while the best set is flat. */
  totalReps: number;
  totalSeconds: number;
  /**
   * The heaviest band actually used across the completed sets — `set_logs.band_actual` where the
   * user corrected it, otherwise what the entry prescribed. Null for bodyweight work.
   */
  band: BandId | null;
  restSec: number;
  tempoSec: number;
}

function heavier(a: BandId | null, b: BandId | null): BandId | null {
  if (a === null) return b;
  if (b === null) return a;
  return BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(a) ? b : a;
}

/**
 * Every completed session in which this exercise ran, oldest first — the order a progression chart
 * reads in.
 *
 * Deliberately scoped to `sessions.status = 'completed'`: a discarded session is not tracked
 * history, and an in-flight one has not happened yet. Entries removed at approval never ran, so
 * they are excluded too; a session where every set was skipped contributes no completed sets and
 * is dropped rather than plotted as a zero (invariant 4 — a skipped day is not a data point about
 * how strong someone is).
 *
 * Matches on `session_entries.exercise_id` — "what actually ran" — so an exercise swapped *in*
 * mid-workout counts for the exercise the user actually performed, which is the whole question the
 * chart answers.
 */
export function getExercisePerformanceHistory(
  db: Db,
  exerciseId: string,
): ExerciseSessionPerformance[] {
  const entryRows = db
    .select({
      id: schema.sessionEntries.id,
      sessionId: schema.sessionEntries.sessionId,
      band: schema.sessionEntries.band,
      restSec: schema.sessionEntries.restSec,
      tempoSec: schema.sessionEntries.tempoSec,
      entryStatus: schema.sessionEntries.entryStatus,
    })
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.exerciseId, exerciseId))
    .all()
    .filter((e) => e.entryStatus !== 'removed_at_approval');
  if (entryRows.length === 0) return [];

  const sessionRows = db
    .select({
      id: schema.sessions.id,
      localDate: schema.sessions.localDate,
      createdAt: schema.sessions.createdAt,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, USER_ID),
        eq(schema.sessions.status, 'completed'),
        inArray(
          schema.sessions.id,
          entryRows.map((e) => e.sessionId),
        ),
      ),
    )
    .all();
  if (sessionRows.length === 0) return [];

  const completedSessions = new Map(sessionRows.map((s) => [s.id, s]));
  const liveEntries = entryRows.filter((e) => completedSessions.has(e.sessionId));

  const setRows = db
    .select()
    .from(schema.setLogs)
    .where(
      inArray(
        schema.setLogs.entryId,
        liveEntries.map((e) => e.id),
      ),
    )
    .all()
    .filter((s) => s.status === 'completed');

  const byEntry = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const list = byEntry.get(row.entryId);
    if (list) list.push(row);
    else byEntry.set(row.entryId, [row]);
  }

  // Fold by session, not by entry: one session can hold more than one entry for the same exercise
  // (an approval-time add alongside the generated one), and the chart plots sessions.
  const bySession = new Map<string, ExerciseSessionPerformance>();
  for (const entry of liveEntries) {
    const sets = byEntry.get(entry.id) ?? [];
    if (sets.length === 0) continue;
    const session = completedSessions.get(entry.sessionId)!;

    const point: ExerciseSessionPerformance = bySession.get(entry.sessionId) ?? {
      sessionId: entry.sessionId,
      localDate: session.localDate,
      setsCompleted: 0,
      bestReps: null,
      bestSeconds: null,
      totalReps: 0,
      totalSeconds: 0,
      band: null,
      restSec: entry.restSec,
      tempoSec: entry.tempoSec,
    };

    for (const set of sets) {
      point.setsCompleted += 1;
      if (set.repsActual != null) {
        point.totalReps += set.repsActual;
        point.bestReps = Math.max(point.bestReps ?? 0, set.repsActual);
      }
      if (set.secondsActual != null) {
        point.totalSeconds += set.secondsActual;
        point.bestSeconds = Math.max(point.bestSeconds ?? 0, set.secondsActual);
      }
      point.band = heavier(point.band, (set.bandActual ?? entry.band) as BandId | null);
    }

    bySession.set(entry.sessionId, point);
  }

  return [...bySession.values()].sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
    // Two sessions on one local date: fall back to creation order so the series is still a
    // sequence rather than an arbitrary map ordering.
    const aCreated = completedSessions.get(a.sessionId)!.createdAt;
    const bCreated = completedSessions.get(b.sessionId)!.createdAt;
    return aCreated < bCreated ? -1 : aCreated > bCreated ? 1 : 0;
  });
}
