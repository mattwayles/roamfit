/**
 * §4.6/§4.7 Session repository — the lifecycle (`planned -> active -> completed | discarded`,
 * §4.6), planned-vs-actual set logging, and the §10.10 single-pending-session invariant.
 *
 * Crash safety (§10.8): `logSet` is one committed write per set. Resuming after a force-quit is
 * just re-reading `getSession` — there is no separate "cursor" that could go stale, because
 * "which set was in progress" is entirely reconstructible from which `set_logs` rows exist.
 */
import { eq, and, desc } from 'drizzle-orm';
import type {
  BandId,
  Effort,
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
  effort: Effort;
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
  effort: Effort;
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
    effort: row.effort,
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
    effort: row.effort,
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
    effort: e.effort,
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
      effort: plan.effort,
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
  return id;
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

export function recordSwap(
  db: Db,
  entryId: string,
  toExerciseId: string,
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
  db.update(schema.sessionEntries)
    .set({ exerciseId: toExerciseId })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();
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

export function recordEntryFeedback(
  db: Db,
  entryId: string,
  feedback: { difficulty?: 'too_easy' | 'just_right' | 'too_hard'; enjoyment?: number },
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
    recordDifficultyFeedback(db, entry.exerciseId, feedback.difficulty, now);
  }
  if (feedback.enjoyment !== undefined) {
    values.enjoymentFeedback = feedback.enjoyment;
    recordEnjoymentFeedback(db, entry.exerciseId, feedback.enjoyment, now);
  }
  if (Object.keys(values).length > 0) {
    db.update(schema.sessionEntries).set(values).where(eq(schema.sessionEntries.id, entryId)).run();
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
      effort: e.effort,
      sets: e.sets,
    }));
    return {
      localDate: row.localDate,
      focus: row.focus as Focus,
      effort: row.effort,
      status: row.status === 'completed' ? 'completed' : 'discarded',
      entries: historyEntries,
    };
  });
}
