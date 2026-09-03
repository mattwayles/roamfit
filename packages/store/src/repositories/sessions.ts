/**
 * §4.6/§4.7 Session repository — the lifecycle (`planned -> active -> completed | discarded`,
 * §4.6), planned-vs-actual set logging, and the §10.10 single-pending-session invariant.
 *
 * Crash safety (§10.8): `logSet` is one committed write per set. Resuming after a force-quit is
 * just re-reading `getSession` — there is no separate "cursor" that could go stale, because
 * "which set was in progress" is entirely reconstructible from which `set_logs` rows exist.
 */
import { eq, and, desc } from 'drizzle-orm';
import { estimateEntrySec } from '@roamfit/engine';
import type {
  BandId,
  Difficulty,
  PatternGapNote,
  SessionEntry as EngineSessionEntry,
  SessionHistoryEntry,
  SessionHistoryRecord,
  SessionPlan,
  TimeBudgetDeviation,
} from '@roamfit/engine';
import type { Focus } from '@roamfit/data';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';
import {
  incrementRemoveAtApprovalCount,
  incrementSwapAwayCount,
  recordDifficultyFeedback,
  recordEnjoymentFeedback,
} from './exerciseState';
import { logSignalEvent } from './signals';
import { enqueueDeferredWork } from './queues';
import { addMilestone } from './milestones';

const USER_ID = 'local';

export class PendingSessionExistsError extends Error {
  constructor(public readonly pendingSessionId: string) {
    super(`A pending session already exists (${pendingSessionId}) — resume or discard it first.`);
    this.name = 'PendingSessionExistsError';
  }
}

// ------------------------------------------------------------------------------------------
// Records
// ------------------------------------------------------------------------------------------

export interface SetLogRecord {
  id: string;
  entryId: string;
  setIndex: number;
  status: 'completed' | 'skipped' | 'not_reached';
  repsPrescribed: number | null;
  secondsPrescribed: number | null;
  repsActual: number | null;
  secondsActual: number | null;
  /** The band actually used for this set, when the user said so on the workout screen. Null means
   *  no correction: bodyweight work, or the prescription followed as written. */
  bandActual: BandId | null;
  startedAt: string | null;
  completedAt: string | null;
  restPrescribedSec: number;
  restTakenSec: number | null;
  restExtendedCount: number;
  pauseCount: number;
  pausedDurationSec: number;
}

export interface SessionEntryRecord {
  id: string;
  sessionId: string;
  section: 'warmup' | 'main' | 'cooldown';
  orderIndex: number;
  plannedExerciseId: string;
  exerciseId: string;
  role: string;
  group: string | null;
  band: BandId | null;
  sets: number;
  repTarget: number | null;
  durationSec: number | null;
  restSec: number;
  tempoSec: number;
  notes: string | null;
  difficulty: Difficulty;
  progressionFamilyId: string | null;
  progressionLevelIdAtTime: string | null;
  pattern: string;
  anchorClass: string;
  unilateral: boolean;
  estimatedSec: number;
  substitutedFor: string | null;
  unplanned: boolean;
  entryStatus: 'planned' | 'removed_at_approval' | 'unplanned_added';
  difficultyFeedback: 'too_easy' | 'just_right' | 'too_hard' | null;
  enjoymentFeedback: number | null;
  demoMediaExpanded: boolean;
  setLogs: SetLogRecord[];
}

export interface SessionRecord {
  id: string;
  status: 'planned' | 'active' | 'completed' | 'discarded';
  utcInstant: string;
  localDate: string;
  tzId: string;
  focus: Focus;
  difficulty: Difficulty;
  format: string;
  targetMinutes: number;
  estimatedMinutes: number;
  actualMinutes: number | null;
  anchorsSnapshot: string[];
  explanation: string;
  patternGaps: PatternGapNote[];
  timeBudgetDeviation: TimeBudgetDeviation | null;
  retrospective: string | null;
  city: string | null;
  country: string | null;
  generatedBy: 'engine' | 'engine+llm';
  engineVersion: string;
  comebackTier: 'none' | 'week' | 'reset';
  recoveryWeekManual: boolean;
  abandonedEntryId: string | null;
  abandonedSetIndex: number | null;
  regenerateTapCount: number;
  startedAt: string | null;
  /** §10.4 — the instant the currently-open workout-level pause began, or null while running. */
  pausedAt: string | null;
  /** Seconds banked from pauses already closed. See `activeElapsedSec`. */
  pausedTotalSec: number;
  completedAt: string | null;
  discardedAt: string | null;
  entries: SessionEntryRecord[];
}

function rowToSetLog(row: typeof schema.setLogs.$inferSelect): SetLogRecord {
  return {
    id: row.id,
    entryId: row.entryId,
    setIndex: row.setIndex,
    status: row.status,
    repsPrescribed: row.repsPrescribed,
    secondsPrescribed: row.secondsPrescribed,
    repsActual: row.repsActual,
    secondsActual: row.secondsActual,
    bandActual: row.bandActual as BandId | null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    restPrescribedSec: row.restPrescribedSec,
    restTakenSec: row.restTakenSec,
    restExtendedCount: row.restExtendedCount,
    pauseCount: row.pauseCount,
    pausedDurationSec: row.pausedDurationSec,
  };
}

function rowToEntry(
  row: typeof schema.sessionEntries.$inferSelect,
  setLogs: SetLogRecord[],
): SessionEntryRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    section: row.section,
    orderIndex: row.orderIndex,
    plannedExerciseId: row.plannedExerciseId,
    exerciseId: row.exerciseId,
    role: row.role,
    group: row.group,
    band: row.band as BandId | null,
    sets: row.sets,
    repTarget: row.repTarget,
    durationSec: row.durationSec,
    restSec: row.restSec,
    tempoSec: row.tempoSec,
    notes: row.notes,
    difficulty: row.difficulty,
    progressionFamilyId: row.progressionFamilyId,
    progressionLevelIdAtTime: row.progressionLevelIdAtTime,
    pattern: row.pattern,
    anchorClass: row.anchorClass,
    unilateral: row.unilateral,
    estimatedSec: row.estimatedSec,
    substitutedFor: row.substitutedFor,
    unplanned: row.unplanned,
    entryStatus: row.entryStatus,
    difficultyFeedback: row.difficultyFeedback,
    enjoymentFeedback: row.enjoymentFeedback,
    demoMediaExpanded: row.demoMediaExpanded,
    setLogs,
  };
}

function loadEntries(db: Db, sessionId: string): SessionEntryRecord[] {
  const entryRows = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.sessionId, sessionId))
    .all()
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const setLogRows = db.select().from(schema.setLogs).all();
  const byEntry = new Map<string, SetLogRecord[]>();
  for (const row of setLogRows) {
    if (!byEntry.has(row.entryId)) byEntry.set(row.entryId, []);
    byEntry.get(row.entryId)!.push(rowToSetLog(row));
  }
  return entryRows.map((row) =>
    rowToEntry(
      row,
      (byEntry.get(row.id) ?? []).sort((a, b) => a.setIndex - b.setIndex),
    ),
  );
}

function rowToSession(
  row: typeof schema.sessions.$inferSelect,
  entries: SessionEntryRecord[],
): SessionRecord {
  return {
    id: row.id,
    status: row.status,
    utcInstant: row.utcInstant,
    localDate: row.localDate,
    tzId: row.tzId,
    focus: row.focus as Focus,
    difficulty: row.difficulty,
    format: row.format,
    targetMinutes: row.targetMinutes,
    estimatedMinutes: row.estimatedMinutes,
    actualMinutes: row.actualMinutes,
    anchorsSnapshot: JSON.parse(row.anchorsSnapshot),
    explanation: row.explanation,
    patternGaps: JSON.parse(row.patternGaps),
    timeBudgetDeviation: row.timeBudgetDeviation ? JSON.parse(row.timeBudgetDeviation) : null,
    retrospective: row.retrospective,
    city: row.city,
    country: row.country,
    generatedBy: row.generatedBy,
    engineVersion: row.engineVersion,
    comebackTier: row.comebackTier,
    recoveryWeekManual: row.recoveryWeekManual,
    abandonedEntryId: row.abandonedEntryId,
    abandonedSetIndex: row.abandonedSetIndex,
    regenerateTapCount: row.regenerateTapCount,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    pausedTotalSec: row.pausedTotalSec,
    completedAt: row.completedAt,
    discardedAt: row.discardedAt,
    entries,
  };
}

export function getSession(db: Db, sessionId: string): SessionRecord | null {
  const rows = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).all();
  if (rows.length === 0) return null;
  return rowToSession(rows[0], loadEntries(db, sessionId));
}

/** §10.10 — the one pending (planned|active) session, if any. */
export function getPendingSession(db: Db): SessionRecord | null {
  const rows = db.select().from(schema.sessions).where(eq(schema.sessions.pendingSlot, 1)).all();
  if (rows.length === 0) return null;
  return rowToSession(rows[0], loadEntries(db, rows[0].id));
}

// ------------------------------------------------------------------------------------------
// Creation
// ------------------------------------------------------------------------------------------

export interface CreateSessionInput {
  plan: SessionPlan;
  utcInstant: string;
  localDate: string;
  tzId: string;
  generatedBy?: 'engine' | 'engine+llm';
  comebackTier?: 'none' | 'week' | 'reset';
  recoveryWeekManual?: boolean;
}

function entryValues(
  sessionId: string,
  section: 'warmup' | 'main' | 'cooldown',
  entries: EngineSessionEntry[],
  startIndex: number,
) {
  return entries.map((e, i) => ({
    id: newId(),
    sessionId,
    section,
    orderIndex: startIndex + i,
    plannedExerciseId: e.exerciseId,
    exerciseId: e.exerciseId,
    role: e.role,
    group: e.group ?? null,
    band: e.band,
    sets: e.sets,
    repTarget: e.repTarget ?? null,
    durationSec: e.durationSec ?? null,
    restSec: e.restSec,
    tempoSec: e.tempoSec,
    notes: e.notes ?? null,
    difficulty: e.difficulty,
    progressionFamilyId: e.progressionFamilyId,
    progressionLevelIdAtTime: e.progressionLevelIdAtTime,
    pattern: e.pattern,
    anchorClass: e.anchorClass,
    unilateral: e.unilateral,
    estimatedSec: e.estimatedSec,
    substitutedFor: e.substitutedFor ?? null,
    unplanned: e.unplanned ?? false,
  }));
}

/** Throws `PendingSessionExistsError` if a session is already pending — §10.10 is a hard
 *  invariant. The partial unique index on `pending_slot` backs this up at the DB level. */
export function createPendingSession(db: Db, input: CreateSessionInput): string {
  const existingPending = getPendingSession(db);
  if (existingPending) throw new PendingSessionExistsError(existingPending.id);

  const id = newId();
  const { plan } = input;
  db.insert(schema.sessions)
    .values({
      id,
      userId: USER_ID,
      status: 'planned',
      pendingSlot: 1,
      utcInstant: input.utcInstant,
      localDate: input.localDate,
      tzId: input.tzId,
      focus: plan.focus,
      difficulty: plan.difficulty,
      format: plan.format,
      targetMinutes: plan.targetMinutes,
      estimatedMinutes: plan.estimatedMinutes,
      anchorsSnapshot: JSON.stringify(plan.anchorsSnapshot),
      explanation: plan.explanation,
      patternGaps: JSON.stringify(plan.patternGaps),
      timeBudgetDeviation: plan.timeBudgetDeviation
        ? JSON.stringify(plan.timeBudgetDeviation)
        : null,
      generatedBy: input.generatedBy ?? 'engine',
      engineVersion: plan.engineVersion,
      comebackTier: input.comebackTier ?? 'none',
      recoveryWeekManual: input.recoveryWeekManual ?? false,
      createdAt: input.utcInstant,
      updatedAt: input.utcInstant,
    })
    .run();

  const rows = [
    ...entryValues(id, 'warmup', plan.warmup, 0),
    ...entryValues(id, 'main', plan.main, plan.warmup.length),
    ...entryValues(id, 'cooldown', plan.cooldown, plan.warmup.length + plan.main.length),
  ];
  for (const row of rows) {
    db.insert(schema.sessionEntries).values(row).run();
  }

  // §7.1/§11.3 — coach voice is async, cached per session, never blocking: the deterministic
  // `explanation` line above is what the approval screen shows immediately and forever if this
  // job never completes. Enqueued here (not awaited, not even attempted here) so this function
  // stays synchronous and offline-safe; a separate queue worker drains it when connectivity
  // exists (see `repositories/queues.ts` / `llmQueueWorker.ts`).
  enqueueDeferredWork(db, 'llm_coach_voice', id, {}, input.utcInstant);

  return id;
}

/** §7.1 coach voice landing: called by the §11.3 queue worker only after
 *  `@roamfit/engine`'s `validateCoachVoiceOutput` has already accepted the response. Replaces
 *  the deterministic §5.8 line and flags `generatedBy: 'engine+llm'`. Safe to call any time
 *  before or after the session completes — coach voice is cosmetic, never gates a lifecycle
 *  transition. No-op if the session no longer exists (discarded before the job ran). */
/** §9.6/§11.3 — applies a resolved `passport_geocode` deferred-work job onto the session it was
 *  queued for. **Pins the result to the session's own `local_date`** (already fixed at creation
 *  time, never touched here) — never the date the lookup happened to resolve on (invariant 6: all
 *  calendar math uses `local_date`, never UTC; §11.3's location-queue rule states this
 *  explicitly). Writes a `new_city` milestone the first time this city appears among the user's
 *  *other* completed sessions — this is the one place that milestone type (present in the enum
 *  since Wave 5 but never produced until now) actually gets written. A no-op if the session was
 *  discarded before the lookup resolved (there's nothing left to pin it to). */
export function applyGeocodeResult(
  db: Db,
  sessionId: string,
  result: { city: string; country: string },
  now: string,
): void {
  const session = getSession(db, sessionId);
  if (!session) return;

  const priorCityRows = db
    .select({ city: schema.sessions.city })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, USER_ID),
        eq(schema.sessions.status, 'completed'),
        eq(schema.sessions.city, result.city),
      ),
    )
    .all();
  const isNewCity = priorCityRows.length === 0;

  db.update(schema.sessions)
    .set({ city: result.city, country: result.country, updatedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();

  if (isNewCity) {
    addMilestone(
      db,
      {
        type: 'new_city',
        payload: { city: result.city, country: result.country },
        sessionId,
        // Pinned to the session's own local_date, not `now` — the whole point of the queue.
        localDate: session.localDate,
      },
      now,
    );
  }
}

export function applyCoachVoiceResult(
  db: Db,
  sessionId: string,
  rewrittenExplanation: string,
  now: string,
): void {
  db.update(schema.sessions)
    .set({ explanation: rewrittenExplanation, generatedBy: 'engine+llm', updatedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

// ------------------------------------------------------------------------------------------
// Lifecycle transitions
// ------------------------------------------------------------------------------------------

export function startSession(db: Db, sessionId: string, now: string): void {
  db.update(schema.sessions)
    .set({ status: 'active', startedAt: now, updatedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

/**
 * §10.4 — pause the workout-level clock. Persisted rather than held on the screen, because a pause
 * has to survive exactly the things a user does while paused: navigating away, locking the phone,
 * force-quitting. Idempotent: pausing an already-paused session leaves the open pause where it is,
 * so a double tap cannot lose the elapsed time banked so far.
 */
export function pauseSession(db: Db, sessionId: string, now: string): void {
  const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).all()[0];
  if (!row || row.pausedAt != null) return;
  db.update(schema.sessions)
    .set({ pausedAt: now, updatedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

/** The counterpart: close the open pause and bank its seconds. Also idempotent — resuming a
 *  running session does nothing. */
export function resumeSession(db: Db, sessionId: string, now: string): void {
  const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).all()[0];
  if (!row || row.pausedAt == null) return;
  db.update(schema.sessions)
    .set({
      pausedAt: null,
      pausedTotalSec: row.pausedTotalSec + pauseLengthSec(row.pausedAt, now),
      updatedAt: now,
    })
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

function pauseLengthSec(pausedAt: string, now: string): number {
  return Math.max(0, Math.round((Date.parse(now) - Date.parse(pausedAt)) / 1000));
}

/**
 * §10.4 — how long this session has actually been *running*: wall-clock since `startedAt`, minus
 * every second spent paused, including a pause still open right now.
 *
 * Re-derived from absolute instants on every read rather than counted per tick, for the same
 * reason `wallClockTimer.ts` is: however long the JS thread was suspended between two reads, the
 * arithmetic is right the instant it runs again. This is the one definition of session elapsed
 * time — the screen's timer and the `actualMinutes` written at completion both use it, so they
 * cannot disagree.
 */
export function activeElapsedSec(
  session: Pick<SessionRecord, 'startedAt' | 'pausedAt' | 'pausedTotalSec'>,
  now: string,
): number {
  if (!session.startedAt) return 0;
  const gross = Math.max(0, (Date.parse(now) - Date.parse(session.startedAt)) / 1000);
  const openPause = session.pausedAt ? pauseLengthSec(session.pausedAt, now) : 0;
  return Math.max(0, gross - session.pausedTotalSec - openPause);
}

export function discardSession(
  db: Db,
  sessionId: string,
  input: { abandonedEntryId?: string; abandonedSetIndex?: number },
  now: string,
): void {
  db.update(schema.sessions)
    .set({
      status: 'discarded',
      pendingSlot: null,
      discardedAt: now,
      updatedAt: now,
      abandonedEntryId: input.abandonedEntryId ?? null,
      abandonedSetIndex: input.abandonedSetIndex ?? null,
    })
    .where(eq(schema.sessions.id, sessionId))
    .run();
  logSignalEvent(db, {
    sessionId,
    type: 'abandoned',
    payload: { entryId: input.abandonedEntryId ?? null, setIndex: input.abandonedSetIndex ?? null },
    utcInstant: now,
    localDate: getSession(db, sessionId)?.localDate ?? now.slice(0, 10),
  });
}

// ------------------------------------------------------------------------------------------
// Approval-stage edits (§8.3: removed / added at approval; §10.10: nothing is deleted, the plan
// is preserved via entry_status rather than a row disappearing).
// ------------------------------------------------------------------------------------------

export function removeEntryAtApproval(db: Db, entryId: string, now: string): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return;
  db.update(schema.sessionEntries)
    .set({ entryStatus: 'removed_at_approval' })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  incrementRemoveAtApprovalCount(db, entry.exerciseId, now);
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'remove_at_approval',
    payload: { entryId, exerciseId: entry.exerciseId },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/** §8.3 — "sets added or deleted at approval." An entry is still `entryStatus: 'planned'` at
 *  this point (nothing has run yet), so adjusting `sets` here edits the plan itself rather than
 *  overwriting a record of what happened — the planned-vs-actual invariant is about execution
 *  (`set_logs`), not about pre-active approval edits. The before/after is still preserved,
 *  though: the signal event payload records the original count, so nothing is silently lost. */
export function adjustSetsAtApproval(db: Db, entryId: string, newSets: number, now: string): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry || newSets === entry.sets) return;
  const type = newSets > entry.sets ? 'set_added_at_approval' : 'set_deleted_at_approval';
  db.update(schema.sessionEntries)
    // §5.6 — `estimatedSec` is what the approval screen's "~N min" sums and what the time budget
    // is denominated in, so it has to move with the shape of the entry. Recomputed by the engine,
    // never re-derived here (invariant 2).
    .set({ sets: newSets, estimatedSec: estimateEntrySec({ ...entry, sets: newSets }) })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type,
    payload: { entryId, exerciseId: entry.exerciseId, fromSets: entry.sets, toSets: newSets },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/** §10.3 — "edit rep targets." Only meaningful for a rep-metric entry (`repTarget` non-null);
 *  a timed entry's duration isn't an approval-time edit surface in this pass. Same
 *  planned-vs-actual reasoning as `adjustSetsAtApproval`: the entry is still `'planned'`, so
 *  this edits the plan itself, and the before/after is preserved in the signal payload rather
 *  than only in the (now-overwritten) column. */
export function adjustRepTargetAtApproval(
  db: Db,
  entryId: string,
  newRepTarget: number,
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry || entry.repTarget == null || newRepTarget === entry.repTarget) return;
  db.update(schema.sessionEntries)
    .set({
      repTarget: newRepTarget,
      estimatedSec: estimateEntrySec({ ...entry, repTarget: newRepTarget }),
    })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'rep_target_adjusted_at_approval',
    payload: {
      entryId,
      exerciseId: entry.exerciseId,
      fromRepTarget: entry.repTarget,
      toRepTarget: newRepTarget,
    },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/** §10.3 — rest is a real dial, not a fixed consequence of the difficulty table. A user who is
 *  short on time, or who wants a session to bite harder, is adjusting exactly this. Floors at 0,
 *  which is a meaningful value (warm-up entries are prescribed with no rest at all) and is why
 *  the card hides the rest label entirely rather than printing "rest 0s". */
export function adjustRestAtApproval(
  db: Db,
  entryId: string,
  newRestSec: number,
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry || newRestSec < 0 || newRestSec === entry.restSec) return;
  db.update(schema.sessionEntries)
    .set({
      restSec: newRestSec,
      estimatedSec: estimateEntrySec({ ...entry, restSec: newRestSec }),
    })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'rest_adjusted_at_approval',
    payload: {
      entryId,
      exerciseId: entry.exerciseId,
      fromRestSec: entry.restSec,
      toRestSec: newRestSec,
    },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/**
 * §10.3 — change the prescribed band while reviewing the plan.
 *
 * The engine picks the band from progression state and the exercise's suggested range; the user is
 * the only one who knows which bands are actually in the bag today, or that the green one is
 * packed. That is a load correction, not an exercise-selection decision, so it does not touch
 * invariant 2 — the engine still chose the movement, the sets and the reps.
 *
 * Only meaningful for an entry that already carries a band: a bodyweight exercise has no band to
 * change, and giving it one here would invent a prescription the engine never made. `estimatedSec`
 * is deliberately not recomputed — §5.6's formulas have no band term.
 */
export function adjustBandAtApproval(db: Db, entryId: string, newBand: BandId, now: string): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry || entry.band == null || newBand === entry.band) return;
  db.update(schema.sessionEntries)
    .set({ band: newBand })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'band_adjusted_at_approval',
    payload: { entryId, exerciseId: entry.exerciseId, fromBand: entry.band, toBand: newBand },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/** §10.3 — swap an exercise while reviewing the plan, before anything has run.
 *
 *  Mechanically identical to `recordSwap` (§10.6) and deliberately shares its swap-away penalty:
 *  the user is rejecting this exercise, which is exactly what `swapAwayCount` is for. It gets its
 *  own signal type rather than reusing `'swap'` with a fabricated `atSetIndex: 0`, because
 *  "swapped before starting" and "swapped during the first set" are different pieces of §8.3
 *  evidence and should not be indistinguishable in the log. */
export function recordSwapAtApproval(
  db: Db,
  entryId: string,
  replacement: Parameters<typeof recordSwap>[2],
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return;
  const fromExerciseId = entry.exerciseId;
  applySwapReplacement(db, entryId, replacement);
  incrementSwapAwayCount(db, fromExerciseId, now);
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'swap_at_approval',
    payload: { entryId, fromExerciseId, toExerciseId: replacement.exerciseId },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/** §10.3 — the timed counterpart to `adjustRepTargetAtApproval`, for a `durationSec` entry (a
 *  plank, a hang, a carry). Rep-based work had an approval-time edit surface and timed work did
 *  not, which left half the library uneditable in the one screen whose whole job is editing the
 *  plan. Identical reasoning throughout: plan-stage edit, before/after preserved in the signal,
 *  `estimatedSec` recomputed by the engine. */
export function adjustDurationAtApproval(
  db: Db,
  entryId: string,
  newDurationSec: number,
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry || entry.durationSec == null || newDurationSec === entry.durationSec) return;
  db.update(schema.sessionEntries)
    .set({
      durationSec: newDurationSec,
      estimatedSec: estimateEntrySec({ ...entry, durationSec: newDurationSec }),
    })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'duration_adjusted_at_approval',
    payload: {
      entryId,
      exerciseId: entry.exerciseId,
      fromDurationSec: entry.durationSec,
      toDurationSec: newDurationSec,
    },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/**
 * §10.3 — "add / remove / swap exercises... " covers re-ordering too (real user request from
 * device testing, not a spec line by itself, but §10.3's warmup/main/cooldown structure is —
 * see the comment below for why this stays section-scoped).
 *
 * `orderedEntryIds` must be exactly the set of this session's currently-active (not
 * `removed_at_approval`) entries in `section`, in the caller's desired order — anything else
 * (wrong length, an id from another section, a removed/unknown id) is refused as a no-op rather
 * than partially applied, same defensive shape as `removeEntryAtApproval`'s "entry not found"
 * guard.
 *
 * **Deliberately reassigns the section's own existing `orderIndex` values, not a fresh
 * contiguous 0..N range.** Warmup/main/cooldown occupy disjoint `orderIndex` bands (see
 * `entryValues` above), and `addEntryAtApproval` can append an entry with an `orderIndex` outside
 * the "normal" contiguous range for its section (it always uses global-max + 1). Reassigning only
 * among the *slots this section's own entries already hold* — never touching another section's
 * rows, never inventing new index values — is what makes "warm-ups must stay before main work"
 * hold structurally rather than by convention: there is no code path here that could move a
 * warmup entry's `orderIndex` past a main entry's, because the set of values available to permute
 * into is fixed to what warmup already owned.
 */
export function reorderEntriesAtApproval(
  db: Db,
  sessionId: string,
  section: 'warmup' | 'main' | 'cooldown',
  orderedEntryIds: string[],
  now: string,
): void {
  const sectionEntries = db
    .select()
    .from(schema.sessionEntries)
    .where(
      and(
        eq(schema.sessionEntries.sessionId, sessionId),
        eq(schema.sessionEntries.section, section),
      ),
    )
    .all()
    .filter((e) => e.entryStatus !== 'removed_at_approval');

  const currentIds = new Set(sectionEntries.map((e) => e.id));
  const isValidPermutation =
    orderedEntryIds.length === sectionEntries.length &&
    new Set(orderedEntryIds).size === orderedEntryIds.length &&
    orderedEntryIds.every((id) => currentIds.has(id));
  if (!isValidPermutation) return;

  // The section's own slots, in ascending order — the fixed set of values this call may permute
  // entries into (see the function doc comment for why this must not become a fresh 0..N range).
  const slots = sectionEntries.map((e) => e.orderIndex).sort((a, b) => a - b);

  orderedEntryIds.forEach((entryId, i) => {
    db.update(schema.sessionEntries)
      .set({ orderIndex: slots[i] })
      .where(eq(schema.sessionEntries.id, entryId))
      .run();
  });

  logSignalEvent(db, {
    sessionId,
    type: 'reorder_at_approval',
    payload: { section, orderedEntryIds },
    utcInstant: now,
    localDate: getSession(db, sessionId)?.localDate ?? now.slice(0, 10),
  });
}

/**
 * §10.3 — "add exercise" at approval. `prescription` is the engine's own output (`@roamfit/
 * engine`'s `prescribeAccessory`, called by `app/`) — the store persists it verbatim, same rule
 * as `recordSwap`'s replacement prescription (CLAUDE.md invariant 2: the engine decides).
 * Appended at the end of its section (`orderIndex` = current max + 1) with `entryStatus:
 * 'unplanned_added'`/`unplanned: true` so it's visibly distinct from the generated plan on
 * completion review, per §4.7/§10.10's "nothing is silently indistinguishable from what the
 * engine actually chose."
 */
export function addEntryAtApproval(
  db: Db,
  sessionId: string,
  section: 'warmup' | 'main' | 'cooldown',
  prescription: EngineSessionEntry,
  now: string,
): string {
  const siblingOrderIndexes = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.sessionId, sessionId))
    .all()
    .map((e) => e.orderIndex);
  const orderIndex = siblingOrderIndexes.length > 0 ? Math.max(...siblingOrderIndexes) + 1 : 0;

  const id = newId();
  db.insert(schema.sessionEntries)
    .values({
      id,
      sessionId,
      section,
      orderIndex,
      plannedExerciseId: prescription.exerciseId,
      exerciseId: prescription.exerciseId,
      role: prescription.role,
      group: prescription.group ?? null,
      band: prescription.band,
      sets: prescription.sets,
      repTarget: prescription.repTarget ?? null,
      durationSec: prescription.durationSec ?? null,
      restSec: prescription.restSec,
      tempoSec: prescription.tempoSec,
      notes: prescription.notes ?? null,
      difficulty: prescription.difficulty,
      progressionFamilyId: prescription.progressionFamilyId,
      progressionLevelIdAtTime: prescription.progressionLevelIdAtTime,
      pattern: prescription.pattern,
      anchorClass: prescription.anchorClass,
      unilateral: prescription.unilateral,
      estimatedSec: prescription.estimatedSec,
      substitutedFor: prescription.substitutedFor ?? null,
      unplanned: true,
      entryStatus: 'unplanned_added',
    })
    .run();

  logSignalEvent(db, {
    sessionId,
    type: 'add_at_approval',
    payload: { entryId: id, exerciseId: prescription.exerciseId, section },
    utcInstant: now,
    localDate: getSession(db, sessionId)?.localDate ?? now.slice(0, 10),
  });
  return id;
}

export function recordRegenerateTap(db: Db, sessionId: string, now: string): void {
  const session = getSession(db, sessionId);
  db.update(schema.sessions)
    .set({ regenerateTapCount: (session?.regenerateTapCount ?? 0) + 1, updatedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();
  logSignalEvent(db, {
    sessionId,
    type: 'regenerate',
    payload: {},
    utcInstant: now,
    localDate: session?.localDate ?? now.slice(0, 10),
  });
}

// ------------------------------------------------------------------------------------------
// Mid-workout swap (§10.6, §8.3: what -> what, at which set).
// ------------------------------------------------------------------------------------------

/**
 * §10.6 — the replacement exercise may have a different metric (reps vs. time), equipment, or
 * band range than the one it replaces (e.g. swapping a band row for a bodyweight one), so a swap
 * has to update the whole prescription, not just `exerciseId` — otherwise the entry would carry
 * the *old* exercise's rep/duration/band shape into a set the new exercise can't actually perform
 * that way. `replacement` is the engine's own `buildSwapReplacementEntry` output (`@roamfit/
 * engine`'s §10.6 export) — the store persists it verbatim rather than recomputing any of it,
 * per CLAUDE.md invariant 2 ("the engine decides, the store/UI never re-derive a prescription").
 */
/** The entry rewrite shared by `recordSwap` (§10.6, mid-workout) and `recordSwapAtApproval`
 *  (§10.3). Persists the engine's replacement prescription verbatim — invariant 2: nothing here
 *  recomputes any of it. `plannedExerciseId` is deliberately untouched, so §10.10's record of
 *  what the engine originally chose survives the swap. */
function applySwapReplacement(
  db: Db,
  entryId: string,
  replacement: Parameters<typeof recordSwap>[2],
): void {
  db.update(schema.sessionEntries)
    .set({
      exerciseId: replacement.exerciseId,
      band: replacement.band as BandId | null,
      sets: replacement.sets,
      repTarget: replacement.repTarget ?? null,
      durationSec: replacement.durationSec ?? null,
      restSec: replacement.restSec,
      tempoSec: replacement.tempoSec,
      notes: replacement.notes ?? null,
      difficulty: replacement.difficulty,
      progressionFamilyId: replacement.progressionFamilyId ?? null,
      progressionLevelIdAtTime: replacement.progressionLevelIdAtTime ?? null,
      pattern: replacement.pattern,
      anchorClass: replacement.anchorClass,
      unilateral: replacement.unilateral,
      estimatedSec: replacement.estimatedSec,
      substitutedFor: replacement.substitutedFor ?? null,
    })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
}

export function recordSwap(
  db: Db,
  entryId: string,
  replacement: Pick<
    EngineSessionEntry,
    | 'exerciseId'
    | 'band'
    | 'sets'
    | 'repTarget'
    | 'durationSec'
    | 'restSec'
    | 'tempoSec'
    | 'notes'
    | 'difficulty'
    | 'progressionFamilyId'
    | 'progressionLevelIdAtTime'
    | 'pattern'
    | 'anchorClass'
    | 'unilateral'
    | 'estimatedSec'
    | 'substitutedFor'
  >,
  atSetIndex: number,
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return;
  const fromExerciseId = entry.exerciseId;
  const toExerciseId = replacement.exerciseId;
  applySwapReplacement(db, entryId, replacement);
  incrementSwapAwayCount(db, fromExerciseId, now);
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'swap',
    payload: { entryId, fromExerciseId, toExerciseId, atSetIndex },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

// ------------------------------------------------------------------------------------------
// §8.1 explicit feedback — per exercise, applies to all its sets. Applied to the EMA
// immediately (the rest screen is the only place these controls appear).
// ------------------------------------------------------------------------------------------

/**
 * §8.1 — "Tapping the same [value] again clears it." The `difficulty`/`enjoyment` keys are
 * three-state, not two: an **omitted** key means "this call doesn't touch that field" (the rest
 * screen calls this once per control, independently), while an explicit `null` means "the user
 * just cleared it" — set the column back to unset. Only a real value feeds the exercise's EMA;
 * clearing intentionally does not attempt to "un-feed" a prior contribution (the EMA is a
 * decayed running signal, not a reversible ledger — nothing in §6/§8 asks for that).
 */
export function recordEntryFeedback(
  db: Db,
  entryId: string,
  feedback: {
    difficulty?: 'too_easy' | 'just_right' | 'too_hard' | null;
    enjoyment?: number | null;
  },
  now: string,
): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return;
  const values: Record<string, unknown> = {};
  if (feedback.difficulty !== undefined) {
    values.difficultyFeedback = feedback.difficulty;
    if (feedback.difficulty !== null) {
      recordDifficultyFeedback(db, entry.exerciseId, feedback.difficulty, now);
    }
  }
  if (feedback.enjoyment !== undefined) {
    values.enjoymentFeedback = feedback.enjoyment;
    if (feedback.enjoyment !== null) {
      recordEnjoymentFeedback(db, entry.exerciseId, feedback.enjoyment, now);
    }
  }
  if (Object.keys(values).length > 0) {
    db.update(schema.sessionEntries).set(values).where(eq(schema.sessionEntries.id, entryId)).run();
  }
}

/**
 * §8.1 feedback for a whole stage at once — the warm-up, or the cool-down.
 *
 * Asking about six warm-up exercises one at a time, each on its own page, was more questions than
 * the answers were worth: a warm-up is done as one block and is judged as one block. So the screen
 * asks once, when the stage ends, and that single answer is written to every entry the stage owns.
 *
 * Deliberately not a new column. Storing it per entry means the exercise-level consumers keep
 * working untouched — `enjoymentEma` still steers `warmupCooldown.ts`'s selection away from the
 * ones the user dislikes, and the summary still shows a value against each line — which is exactly
 * what "the warm-up was rough" means about the exercises that made it up. Entries removed at
 * approval are skipped: they were not part of the stage the user is answering about.
 */
export function recordSectionFeedback(
  db: Db,
  sessionId: string,
  section: 'warmup' | 'main' | 'cooldown',
  feedback: {
    difficulty?: 'too_easy' | 'just_right' | 'too_hard' | null;
    enjoyment?: number | null;
  },
  now: string,
): void {
  const entries = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.sessionId, sessionId))
    .all()
    .filter((e) => e.section === section && e.entryStatus !== 'removed_at_approval');
  for (const entry of entries) {
    recordEntryFeedback(db, entry.id, feedback, now);
  }
}

export function recordDemoMediaExpanded(db: Db, entryId: string, now: string): void {
  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return;
  db.update(schema.sessionEntries)
    .set({ demoMediaExpanded: true })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'demo_media_expanded',
    payload: { entryId, exerciseId: entry.exerciseId },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });
}

// ------------------------------------------------------------------------------------------
// Set logging — crash safety lives here. Each call is one committed write.
// ------------------------------------------------------------------------------------------

export interface LogSetInput {
  entryId: string;
  setIndex: number;
  status: 'completed' | 'skipped' | 'not_reached';
  repsPrescribed?: number;
  secondsPrescribed?: number;
  repsActual?: number;
  secondsActual?: number;
  /** §10.5 — the band actually used for this set. Omit (or null) for bodyweight work and for a set
   *  that followed the prescription. */
  bandActual?: BandId | null;
  startedAt?: string;
  completedAt?: string;
  restPrescribedSec: number;
  restTakenSec?: number;
  restExtendedCount?: number;
  pauseCount?: number;
  pausedDurationSec?: number;
}

/** Upserts one set's log row. Safe to call multiple times for the same (entryId, setIndex) —
 *  e.g. a rest-timer `+15s` tap updates `restExtendedCount` on an already-logged set. This is
 *  the crash-safety substrate: a force-quit resumes at exactly the highest `setIndex` with a
 *  row here, per entry, and nothing else needs to be reconstructed. */
export function logSet(db: Db, input: LogSetInput, now: string): void {
  const existing = db
    .select()
    .from(schema.setLogs)
    .where(
      and(eq(schema.setLogs.entryId, input.entryId), eq(schema.setLogs.setIndex, input.setIndex)),
    )
    .all();

  const values = {
    status: input.status,
    repsPrescribed: input.repsPrescribed ?? null,
    secondsPrescribed: input.secondsPrescribed ?? null,
    repsActual: input.repsActual ?? null,
    secondsActual: input.secondsActual ?? null,
    bandActual: input.bandActual ?? null,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    restPrescribedSec: input.restPrescribedSec,
    restTakenSec: input.restTakenSec ?? null,
    restExtendedCount: input.restExtendedCount ?? 0,
    pauseCount: input.pauseCount ?? 0,
    pausedDurationSec: input.pausedDurationSec ?? 0,
  };

  if (existing.length > 0) {
    db.update(schema.setLogs)
      .set(values)
      .where(
        and(eq(schema.setLogs.entryId, input.entryId), eq(schema.setLogs.setIndex, input.setIndex)),
      )
      .run();
  } else {
    db.insert(schema.setLogs)
      .values({
        id: newId(),
        entryId: input.entryId,
        setIndex: input.setIndex,
        createdAt: now,
        ...values,
      })
      .run();
  }
}

// ------------------------------------------------------------------------------------------
// History projection for the engine's `UserState.history` (§5.2 variety/recovery/volume rules).
// ------------------------------------------------------------------------------------------

/** Projects completed/discarded sessions into the engine's `SessionHistoryRecord[]`, oldest
 *  first, capped at `limit` most recent (the engine only ever looks back as far as its own
 *  rules require — see `UserState.history`'s own doc comment). A session's `status` here reuses
 *  the engine's `'completed'|'partial'|'skipped'|'discarded'` vocabulary; v1 only ever produces
 *  `'completed'` or `'discarded'` (no partial-completion UI yet), mapped 1:1 from our own
 *  `sessions.status`. */
export function getHistoryForGeneration(db: Db, limit = 90): SessionHistoryRecord[] {
  const rows = db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, USER_ID),
        // completed or discarded only — planned/active aren't history yet.
      ),
    )
    .orderBy(desc(schema.sessions.localDate), desc(schema.sessions.createdAt))
    .all()
    .filter((r) => r.status === 'completed' || r.status === 'discarded')
    .slice(0, limit)
    .reverse();

  return rows.map((row): SessionHistoryRecord => {
    const entries = db
      .select()
      .from(schema.sessionEntries)
      .where(eq(schema.sessionEntries.sessionId, row.id))
      .all()
      .filter((e) => e.entryStatus !== 'removed_at_approval');
    const historyEntries: SessionHistoryEntry[] = entries.map((e) => ({
      exerciseId: e.exerciseId,
      role: e.role as SessionHistoryEntry['role'],
      difficulty: e.difficulty,
      sets: e.sets,
    }));
    return {
      localDate: row.localDate,
      focus: row.focus as Focus,
      difficulty: row.difficulty,
      status: row.status === 'completed' ? 'completed' : 'discarded',
      entries: historyEntries,
    };
  });
}

/** §14.1.5/§14.1.6/§9.6 — a light projection of completed sessions for the calendar heatmap and
 *  passport, neither of which need the full entry/set-log tree `getHistoryForGeneration` builds.
 *  Sorted newest-first, capped at `limit` (the calendar/passport are both bounded-window UI —
 *  a year of daily sessions is already generous for what either can usefully show). */
export interface DashboardSessionSummary {
  localDate: string;
  actualMinutes: number | null;
  estimatedMinutes: number;
  /** §9.6 — strings only, never coordinates (invariant 8's passport-adjacent sibling rule).
   *  Null until the §11.3 `passport_geocode` deferred-work queue resolves (or if the user never
   *  opted in). */
  city: string | null;
  country: string | null;
}

/** §9.8 — raw material for "adaptive to the observed training window": each completed session's
 *  start instant plus the tz_id it was generated under, so the caller can derive the *local* hour
 *  the user actually trains in (not the device's current tz, which may differ for a traveler
 *  looking back at sessions from elsewhere). */
export interface SessionStartTime {
  startedAt: string;
  tzId: string;
}

export function getCompletedSessionStartTimes(db: Db, limit = 90): SessionStartTime[] {
  return db
    .select({ startedAt: schema.sessions.startedAt, tzId: schema.sessions.tzId })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, USER_ID), eq(schema.sessions.status, 'completed')))
    .orderBy(desc(schema.sessions.localDate))
    .limit(limit)
    .all()
    .filter((r): r is { startedAt: string; tzId: string } => r.startedAt !== null);
}

export function getCompletedSessionsForDashboard(db: Db, limit = 365): DashboardSessionSummary[] {
  return db
    .select({
      localDate: schema.sessions.localDate,
      actualMinutes: schema.sessions.actualMinutes,
      estimatedMinutes: schema.sessions.estimatedMinutes,
      city: schema.sessions.city,
      country: schema.sessions.country,
    })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, USER_ID), eq(schema.sessions.status, 'completed')))
    .orderBy(desc(schema.sessions.localDate))
    .limit(limit)
    .all();
}
