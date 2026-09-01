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
    .set({ sets: newSets })
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
    .set({ repTarget: newRepTarget })
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
      effort: prescription.effort,
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
    | 'effort'
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
      effort: replacement.effort,
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
