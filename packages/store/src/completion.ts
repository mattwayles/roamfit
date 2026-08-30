/**
 * §10.9 completion — one transaction: write history (by flipping the session to `completed`,
 * §11.3 append-only), persist feedback (already applied per-set/per-entry as it happened —
 * nothing left to do here but read it back), apply progression updates (§6.3/§6.7 via the
 * engine's own `applySessionResult`), update exercise state, write milestone rows, update
 * rolled-up stats, and enqueue (never await) deferred work. Must succeed with zero connectivity
 * (§11.1) — nothing here does I/O beyond the local db.
 */
import type { Exercise, ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import { applySessionResult } from '@roamfit/engine';
import type { ProgressionEvent, SessionPerformance } from '@roamfit/engine';
import type { Db } from './db';
import { schema } from './db';
import { eq } from 'drizzle-orm';
import { getSession } from './repositories/sessions';
import type { SessionEntryRecord, SessionRecord } from './repositories/sessions';
import { getAllProgressionStates, upsertProgressionState } from './repositories/progressionState';
import { getUser, ensureUser, markHasEverCompletedSession } from './repositories/users';
import { incrementSkipCount, recordExercisePerformed } from './repositories/exerciseState';
import { addMilestone } from './repositories/milestones';
import { recordSessionCompletion } from './repositories/stats';
import type { MuscleVolumeEntry } from './repositories/stats';
import { enqueueDeferredWork } from './repositories/queues';
import { getStats } from './repositories/stats';

export interface CompleteSessionInput {
  sessionId: string;
  library: ExerciseLibrary;
  families: FamilyLibrary;
  retrospective?: string;
}

export interface CompleteSessionResult {
  actualMinutes: number;
  progressionEvents: { familyId: string; event: ProgressionEvent }[];
  milestoneTypes: string[];
}

interface WorkingSetSummary {
  completedCount: number;
  anyCompleted: boolean;
  anySkippedOrNotReached: boolean;
  allAtOrAboveTarget: boolean;
  anyBelowTarget: boolean;
  bestActual: number | null; // reps or seconds, whichever applies
  maxExceedRatio: number;
}

function summarizeEntry(entry: SessionEntryRecord): WorkingSetSummary {
  const prescribed = entry.repTarget ?? entry.durationSec ?? null;
  const completed = entry.setLogs.filter((s) => s.status === 'completed');
  const anySkippedOrNotReached = entry.setLogs.some(
    (s) => s.status === 'skipped' || s.status === 'not_reached',
  );

  let allAtOrAboveTarget = completed.length > 0;
  let anyBelowTarget = false;
  let bestActual: number | null = null;
  let maxExceedRatio = 0;

  for (const s of completed) {
    const actual = s.repsActual ?? s.secondsActual ?? null;
    if (actual === null || prescribed === null) continue;
    if (bestActual === null || actual > bestActual) bestActual = actual;
    if (actual < prescribed) {
      anyBelowTarget = true;
      allAtOrAboveTarget = false;
    }
    const ratio = (actual - prescribed) / prescribed;
    if (ratio > maxExceedRatio) maxExceedRatio = ratio;
  }

  return {
    completedCount: completed.length,
    anyCompleted: completed.length > 0,
    anySkippedOrNotReached,
    allAtOrAboveTarget,
    anyBelowTarget,
    bestActual,
    maxExceedRatio,
  };
}

function muscleCreditsForEntry(
  entry: SessionEntryRecord,
  exercise: Exercise | undefined,
  completedCount: number,
): MuscleVolumeEntry[] {
  if (!exercise || completedCount === 0) return [];
  const isHard = entry.effort === 'hard';
  const out: MuscleVolumeEntry[] = [];
  for (const m of exercise.primary) {
    out.push({ muscle: m, sets: completedCount, hardSets: isHard ? completedCount : 0 });
  }
  for (const m of exercise.secondary) {
    out.push({
      muscle: m,
      sets: completedCount * 0.5,
      hardSets: isHard ? completedCount * 0.5 : 0,
    });
  }
  return out;
}

/** The one completion transaction. Throws if the session doesn't exist or is already
 *  completed/discarded. */
export function completeSession(
  db: Db,
  input: CompleteSessionInput,
  now: string,
): CompleteSessionResult {
  return db.transaction((tx) => {
    const txDb = tx as unknown as Db;
    const session = getSession(txDb, input.sessionId);
    if (!session) throw new Error(`completeSession: session ${input.sessionId} not found`);
    if (session.status === 'completed' || session.status === 'discarded') {
      throw new Error(`completeSession: session ${input.sessionId} is already ${session.status}`);
    }

    const actualMinutes = session.startedAt
      ? Math.max(0, (new Date(now).getTime() - new Date(session.startedAt).getTime()) / 60_000)
      : session.estimatedMinutes;

    const progressionEvents: { familyId: string; event: ProgressionEvent }[] = [];
    const milestoneTypes: string[] = [];
    const muscleVolume: MuscleVolumeEntry[] = [];

    const progressionStates = getAllProgressionStates(txDb);
    // Group entries by family so a family with more than one entry in the session (not expected
    // by current templates, but not structurally forbidden) still gets one performance verdict.
    const byFamily = new Map<string, SessionEntryRecord[]>();

    const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');

    for (const entry of activeEntries) {
      const summary = summarizeEntry(entry);
      const exercise = input.library.exercises.find((e) => e.id === entry.exerciseId);

      if (summary.anyCompleted) {
        const { improvedBestSet } = recordExercisePerformed(
          txDb,
          entry.exerciseId,
          {
            localDate: session.localDate,
            bestPerformance: exercise
              ? {
                  reps: exercise.metric === 'time' ? undefined : (summary.bestActual ?? undefined),
                  seconds:
                    exercise.metric === 'time' ? (summary.bestActual ?? undefined) : undefined,
                  band: entry.band,
                }
              : undefined,
          },
          now,
        );
        if (improvedBestSet) {
          milestoneTypes.push('best_set_pr');
          addMilestone(
            txDb,
            {
              type: 'best_set_pr',
              payload: { exerciseId: entry.exerciseId, value: summary.bestActual },
              sessionId: session.id,
              localDate: session.localDate,
            },
            now,
          );
        }
      } else if (summary.anySkippedOrNotReached) {
        incrementSkipCount(txDb, entry.exerciseId, now);
      }

      muscleVolume.push(...muscleCreditsForEntry(entry, exercise, summary.completedCount));

      if (entry.progressionFamilyId) {
        const list = byFamily.get(entry.progressionFamilyId) ?? [];
        list.push(entry);
        byFamily.set(entry.progressionFamilyId, list);
      }
    }

    for (const [familyId, entries] of byFamily) {
      const state = progressionStates[familyId as keyof typeof progressionStates];
      const family = input.families.families.find((f) => f.id === familyId);
      if (!state || !family) continue;

      const summaries = entries.map(summarizeEntry).filter((s) => s.anyCompleted);
      if (summaries.length === 0) continue; // nothing performed for this family this session

      const perf: SessionPerformance = {
        familyId: familyId as SessionPerformance['familyId'],
        allSetsAtOrAboveTop: summaries.every((s) => s.allAtOrAboveTarget),
        missedBottom: summaries.some((s) => s.anyBelowTarget),
        difficultyFeedback: entries[0].difficultyFeedback ?? 'just_right',
        exceededTargetByRatio: Math.max(...summaries.map((s) => s.maxExceedRatio), 0),
      };

      const result = applySessionResult(state, family, input.library.exercises, perf);
      upsertProgressionState(txDb, result.state, now);
      progressionEvents.push({ familyId, event: result.event });

      if (result.event.kind === 'level_up' || result.event.kind === 'calibration_advance') {
        milestoneTypes.push('level_up');
        addMilestone(
          txDb,
          {
            type: 'level_up',
            payload: { familyId, levelId: result.event.levelId },
            sessionId: session.id,
            localDate: session.localDate,
          },
          now,
        );
      }
    }

    const user = getUser(txDb) ?? ensureUser(txDb, now);
    recordSessionCompletion(
      txDb,
      {
        sessionId: session.id,
        localDate: session.localDate,
        weeklyTarget: user.weeklyTarget,
        muscleVolume,
        estimatedMinutes: session.estimatedMinutes,
        actualMinutes,
      },
      now,
    );

    const stats = getStats(txDb);
    milestoneTypes.push('nth_session');
    addMilestone(
      txDb,
      {
        type: 'nth_session',
        payload: { n: (stats?.lifetimeSessionCount ?? 0) + 1 },
        sessionId: session.id,
        localDate: session.localDate,
      },
      now,
    );

    if (session.recoveryWeekManual) {
      milestoneTypes.push('recovery_week');
      addMilestone(
        txDb,
        { type: 'recovery_week', payload: {}, sessionId: session.id, localDate: session.localDate },
        now,
      );
    }

    if (!user.hasEverCompletedSession) markHasEverCompletedSession(txDb, now);

    // §11.3 — enqueue, never await. Workers land in Wave 6.
    enqueueDeferredWork(
      txDb,
      'llm_distillation',
      session.id,
      { retrospective: input.retrospective ?? null },
      now,
    );
    if (user.healthWriteEnabled) {
      enqueueDeferredWork(txDb, 'healthkit_write', session.id, { actualMinutes }, now);
    }
    if (user.passportEnabled) {
      enqueueDeferredWork(
        txDb,
        'passport_geocode',
        session.id,
        { localDate: session.localDate },
        now,
      );
    }

    tx.update(schema.sessions)
      .set({
        status: 'completed',
        pendingSlot: null,
        completedAt: now,
        actualMinutes,
        retrospective: input.retrospective ?? null,
        updatedAt: now,
      })
      .where(eq(schema.sessions.id, session.id))
      .run();

    return { actualMinutes, progressionEvents, milestoneTypes };
  });
}

export type { SessionRecord };
