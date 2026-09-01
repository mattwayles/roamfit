/**
 * §15 Product instrumentation — "separate from the user-facing dashboard; without it there is no
 * way to tell whether the engine is any good."
 *
 * Deliberately NOT a network-reporting SDK: invariant constraints (never a network dependency,
 * never on the critical path, never ship freeform text off-device without consent) rule out the
 * usual "buffer events, batch-POST to an analytics endpoint" shape entirely. Instead this reads
 * the raw signal that's *already* captured locally for other reasons — §8.3's `signal_events`,
 * per-exercise counters on `exercise_state`, and the `sessions`/`session_entries`/`set_logs`
 * tables' own lifecycle columns — and derives every §15 metric from it. All of it stays on
 * device; nothing here calls `fetch`. Surfacing it to a human is a settings-screen "Diagnostics"
 * read, not a wire protocol.
 *
 * The one raw signal that did NOT already exist anywhere: "offline share" (§15/§11 — the
 * proportion of sessions generated with no connectivity). `generation.ts`'s `generate()` now
 * optionally logs a `session_generated` signal event with `{online: boolean}` when the caller
 * supplies a fresh reading; `offlineShare` here is null until at least one such event exists,
 * which is the honest answer for a fresh install rather than a fabricated 0/0 or 100%.
 */
import { eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { daysBetween } from '../dates';
import { getUser } from './users';

const USER_ID = 'local';

// ------------------------------------------------------------------------------------------
// Funnel: generate -> approve/start -> complete, with drop-off.
//
// Honest mapping to this app's actual UI, which conflates "approve" and "start" into one tap
// (Approval screen's Start button calls `startSession` directly — there is no separate
// "approved but not yet started" state in the data model): `approvedOrStarted` is the single
// stage this schema can distinguish between "generated" and "completed". A future wave that
// wants a true 4-stage funnel needs a distinct "approved" signal event logged from
// `ApprovalScreen.tsx`; not added here to avoid inventing UI-side instrumentation this track
// wasn't asked to build.
// ------------------------------------------------------------------------------------------
export interface FunnelSnapshot {
  generated: number;
  approvedOrStarted: number;
  completed: number;
  /** Discarded before ever starting (rejected at approval, or regenerated away). */
  droppedBeforeStart: number;
  /** Started (or still mid-session) but never completed — includes a live-abandoned session and,
   *  rarely, one force-quit without a discard ever being recorded. */
  droppedAfterStart: number;
}

export function computeFunnel(db: Db): FunnelSnapshot {
  const rows = db.select().from(schema.sessions).all();
  const generated = rows.length;
  const started = rows.filter((r) => r.startedAt !== null);
  const completed = rows.filter((r) => r.status === 'completed');
  const droppedBeforeStart = rows.filter(
    (r) => r.status === 'discarded' && r.startedAt === null,
  ).length;
  const droppedAfterStart = rows.filter(
    (r) => r.startedAt !== null && r.status !== 'completed',
  ).length;
  return {
    generated,
    approvedOrStarted: started.length,
    completed: completed.length,
    droppedBeforeStart,
    droppedAfterStart,
  };
}

// ------------------------------------------------------------------------------------------
// Activation: first *completed* workout, target within 5 minutes of install.
// "Install" is approximated as the local user row's `createdAt` — the earliest moment this
// package has any record of the device (§4.3's `ensureUser` fires on the very first store call,
// generation included, so for a real cold install this is effectively install time; documented
// as an approximation, not a true OS-level install timestamp, which this app has no access to).
// ------------------------------------------------------------------------------------------
export interface ActivationSnapshot {
  activated: boolean;
  /** Minutes from the user row's createdAt to the first completed session's completedAt. Null
   *  if not yet activated. */
  minutesToActivation: number | null;
  /** Whether activation happened within the §15 5-minute target. Null if not yet activated. */
  withinTarget: boolean | null;
}

export function computeActivation(db: Db): ActivationSnapshot {
  const user = getUser(db);
  if (!user) return { activated: false, minutesToActivation: null, withinTarget: null };
  const userRow = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all()[0];
  const firstCompleted = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.status, 'completed'))
    .all()
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1))[0];
  if (!userRow || !firstCompleted?.completedAt) {
    return { activated: false, minutesToActivation: null, withinTarget: null };
  }
  const minutes =
    (new Date(firstCompleted.completedAt).getTime() - new Date(userRow.createdAt).getTime()) /
    60_000;
  return { activated: true, minutesToActivation: minutes, withinTarget: minutes <= 5 };
}

// ------------------------------------------------------------------------------------------
// Retention: D1 / D7 / D30 — "did the user return with a completed session exactly N days
// after install" (createdAt's local_date), plus week-target adherence over time (fraction of
// ISO weeks since the first session where completed-session count met that week's target —
// note the target used is the user's *current* weeklyTarget, since past-week targets aren't
// separately recorded; documented rather than silently assumed).
// ------------------------------------------------------------------------------------------
export interface RetentionSnapshot {
  d1: boolean;
  d7: boolean;
  d30: boolean;
  weekTargetAdherence: number | null; // 0..1, null if no session yet
}

function isoWeekKey(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function computeRetention(db: Db): RetentionSnapshot {
  const user = getUser(db);
  const userRow = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all()[0];
  if (!user || !userRow) return { d1: false, d7: false, d30: false, weekTargetAdherence: null };
  const installLocalDate = userRow.createdAt.slice(0, 10);
  const completed = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.status, 'completed'))
    .all();
  const completedDates = new Set(completed.map((r) => r.localDate));
  const returnedOn = (n: number) =>
    [...completedDates].some((d) => daysBetween(installLocalDate, d) === n);

  let weekTargetAdherence: number | null = null;
  if (completed.length > 0) {
    const byWeek = new Map<string, number>();
    for (const r of completed) {
      const wk = isoWeekKey(r.localDate);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
    }
    const weeksHit = [...byWeek.values()].filter((n) => n >= user.weeklyTarget).length;
    weekTargetAdherence = weeksHit / byWeek.size;
  }

  return { d1: returnedOn(1), d7: returnedOn(7), d30: returnedOn(30), weekTargetAdherence };
}

// ------------------------------------------------------------------------------------------
// Completion rate by session length, and estimate-accuracy distribution — both direct tests of
// the time-budget model (§14.1.9 / §15).
// ------------------------------------------------------------------------------------------
export interface CompletionByLengthRow {
  targetMinutes: number;
  started: number;
  completed: number;
  rate: number; // completed / started, 0 when started is 0
}

export function computeCompletionRateByLength(db: Db): CompletionByLengthRow[] {
  const rows = db.select().from(schema.sessions).where(isNotNull(schema.sessions.startedAt)).all();
  const byTarget = new Map<number, { started: number; completed: number }>();
  for (const r of rows) {
    const bucket = byTarget.get(r.targetMinutes) ?? { started: 0, completed: 0 };
    bucket.started += 1;
    if (r.status === 'completed') bucket.completed += 1;
    byTarget.set(r.targetMinutes, bucket);
  }
  return [...byTarget.entries()]
    .map(([targetMinutes, v]) => ({
      targetMinutes,
      started: v.started,
      completed: v.completed,
      rate: v.started === 0 ? 0 : v.completed / v.started,
    }))
    .sort((a, b) => a.targetMinutes - b.targetMinutes);
}

export interface EstimateAccuracyDistribution {
  within10Pct: number;
  within25Pct: number;
  over25PctOff: number;
  /** Sessions with no actualMinutes recorded (shouldn't happen for completed ones, but a stray
   *  legacy row shouldn't crash this computation). */
  unknown: number;
}

export function computeEstimateAccuracyDistribution(db: Db): EstimateAccuracyDistribution {
  const rows = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.status, 'completed'))
    .all();
  const out: EstimateAccuracyDistribution = {
    within10Pct: 0,
    within25Pct: 0,
    over25PctOff: 0,
    unknown: 0,
  };
  for (const r of rows) {
    if (r.actualMinutes === null || r.estimatedMinutes === 0) {
      out.unknown += 1;
      continue;
    }
    const pctOff = Math.abs(r.actualMinutes - r.estimatedMinutes) / r.estimatedMinutes;
    if (pctOff <= 0.1) out.within10Pct += 1;
    else if (pctOff <= 0.25) out.within25Pct += 1;
    else out.over25PctOff += 1;
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Swap/removal rate per exercise (library-quality signal) and video flag rate — both already
// tracked as running counters on `exercise_state` for other reasons; this just ranks them.
// ------------------------------------------------------------------------------------------
export interface ExerciseSignalRow {
  exerciseId: string;
  sessionsPerformed: number;
  swapAwayCount: number;
  removeAtApprovalCount: number;
  videoFlagCount: number;
}

/** Sorted by swap+removal+flag count descending — the exercises most worth a content look. Reads
 *  `exercise_state` directly rather than via `getAllExerciseStates` because the engine-facing
 *  `EngineExerciseState` type deliberately drops columns (like `videoFlagCount`) the engine has
 *  no use for — this is a store/instrumentation-only projection of the same table. */
export function computeExerciseSignalRanking(db: Db): ExerciseSignalRow[] {
  const rows = db
    .select()
    .from(schema.exerciseState)
    .where(eq(schema.exerciseState.userId, USER_ID))
    .all();
  return rows
    .map((s) => ({
      exerciseId: s.exerciseId,
      sessionsPerformed: s.sessionsPerformed,
      swapAwayCount: s.swapAwayCount,
      removeAtApprovalCount: s.removeAtApprovalCount,
      videoFlagCount: s.videoFlagCount,
    }))
    .filter((r) => r.swapAwayCount + r.removeAtApprovalCount + r.videoFlagCount > 0)
    .sort(
      (a, b) =>
        b.swapAwayCount +
        b.removeAtApprovalCount +
        b.videoFlagCount -
        (a.swapAwayCount + a.removeAtApprovalCount + a.videoFlagCount),
    );
}

// ------------------------------------------------------------------------------------------
// Superset-pair completion rate — whether users finish superset pairs as prescribed or bail via
// swap/removal to something closer to straight sets.
// ------------------------------------------------------------------------------------------
export interface SupersetPairSnapshot {
  totalPairs: number;
  completedAsPrescribed: number;
  rate: number | null; // null when totalPairs is 0 — no superset content run yet
}

export function computeSupersetPairCompletion(db: Db): SupersetPairSnapshot {
  const entries = db
    .select()
    .from(schema.sessionEntries)
    .where(isNotNull(schema.sessionEntries.group))
    .all();
  const sessionsById = new Map(
    db
      .select()
      .from(schema.sessions)
      .all()
      .map((s) => [s.id, s]),
  );

  const bySessionGroup = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.sessionId}::${e.group}`;
    const list = bySessionGroup.get(key) ?? [];
    list.push(e);
    bySessionGroup.set(key, list);
  }

  let totalPairs = 0;
  let completedAsPrescribed = 0;
  for (const [, members] of bySessionGroup) {
    if (members.length < 2) continue; // not actually a pair (e.g. one member removed)
    totalPairs += 1;
    const session = sessionsById.get(members[0].sessionId);
    const allPlanned = members.every((m) => m.entryStatus === 'planned');
    if (session?.status === 'completed' && allPlanned) completedAsPrescribed += 1;
  }

  return {
    totalPairs,
    completedAsPrescribed,
    rate: totalPairs === 0 ? null : completedAsPrescribed / totalPairs,
  };
}

// ------------------------------------------------------------------------------------------
// Abandon point — which exercise and which set, aggregated across every discarded-mid-session
// row (`discardSession`'s `abandonedEntryId`/`abandonedSetIndex`, already captured by §8.3).
// ------------------------------------------------------------------------------------------
export interface AbandonPointRow {
  exerciseId: string;
  setIndex: number | null;
  count: number;
}

export function computeAbandonPoints(db: Db): AbandonPointRow[] {
  const discarded = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.status, 'discarded'))
    .all()
    .filter((r) => r.abandonedEntryId !== null);
  const entryById = new Map(
    db
      .select()
      .from(schema.sessionEntries)
      .all()
      .map((e) => [e.id, e]),
  );

  const byKey = new Map<string, AbandonPointRow>();
  for (const r of discarded) {
    const entry = entryById.get(r.abandonedEntryId!);
    if (!entry) continue;
    const key = `${entry.exerciseId}::${r.abandonedSetIndex ?? 'null'}`;
    const row = byKey.get(key) ?? {
      exerciseId: entry.exerciseId,
      setIndex: r.abandonedSetIndex,
      count: 0,
    };
    row.count += 1;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

// ------------------------------------------------------------------------------------------
// Explicit feedback capture rate — "expected low by design; watch that implicit volume is high."
// ------------------------------------------------------------------------------------------
export interface FeedbackCaptureSnapshot {
  totalEntries: number;
  withExplicitFeedback: number;
  rate: number; // 0 when totalEntries is 0
}

export function computeExplicitFeedbackCaptureRate(db: Db): FeedbackCaptureSnapshot {
  const entries = db.select().from(schema.sessionEntries).all();
  const relevant = entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const withFeedback = relevant.filter(
    (e) => e.difficultyFeedback !== null || e.enjoymentFeedback !== null,
  );
  return {
    totalEntries: relevant.length,
    withExplicitFeedback: withFeedback.length,
    rate: relevant.length === 0 ? 0 : withFeedback.length / relevant.length,
  };
}

// ------------------------------------------------------------------------------------------
// Offline share — see the file header for why this needed one new signal event type.
// ------------------------------------------------------------------------------------------
export interface OfflineShareSnapshot {
  /** Null when no `session_generated` event has ever been logged (no reading available yet),
   *  rather than a fabricated 0. */
  share: number | null;
  sampleSize: number;
}

export function computeOfflineShare(db: Db): OfflineShareSnapshot {
  const rows = db
    .select()
    .from(schema.signalEvents)
    .where(eq(schema.signalEvents.type, 'session_generated'))
    .all();
  if (rows.length === 0) return { share: null, sampleSize: 0 };
  const offlineCount = rows.filter((r) => {
    const payload = JSON.parse(r.payload) as { online?: boolean };
    return payload.online === false;
  }).length;
  return { share: offlineCount / rows.length, sampleSize: rows.length };
}

// ------------------------------------------------------------------------------------------
// One-call snapshot of everything above — what a diagnostics screen reads.
// ------------------------------------------------------------------------------------------
export interface InstrumentationSnapshot {
  funnel: FunnelSnapshot;
  activation: ActivationSnapshot;
  retention: RetentionSnapshot;
  completionByLength: CompletionByLengthRow[];
  estimateAccuracy: EstimateAccuracyDistribution;
  exerciseSignals: ExerciseSignalRow[];
  supersetPairs: SupersetPairSnapshot;
  abandonPoints: AbandonPointRow[];
  explicitFeedback: FeedbackCaptureSnapshot;
  offlineShare: OfflineShareSnapshot;
}

export function computeInstrumentationSnapshot(db: Db): InstrumentationSnapshot {
  return {
    funnel: computeFunnel(db),
    activation: computeActivation(db),
    retention: computeRetention(db),
    completionByLength: computeCompletionRateByLength(db),
    estimateAccuracy: computeEstimateAccuracyDistribution(db),
    exerciseSignals: computeExerciseSignalRanking(db),
    supersetPairs: computeSupersetPairCompletion(db),
    abandonPoints: computeAbandonPoints(db),
    explicitFeedback: computeExplicitFeedbackCaptureRate(db),
    offlineShare: computeOfflineShare(db),
  };
}
