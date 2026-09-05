/**
 * §10.9 completion — one transaction: write history (by flipping the session to `completed`,
 * §11.3 append-only), persist feedback (already applied per-set/per-entry as it happened —
 * nothing left to do here but read it back), apply progression updates (§6.3/§6.7 via the
 * engine's own `applySessionResult`), update exercise state, write milestone rows, update
 * rolled-up stats, and enqueue (never await) deferred work. Must succeed with zero connectivity
 * (§11.1) — nothing here does I/O beyond the local db.
 */
import type { Exercise, ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import { applySessionResult, BAND_ORDER } from '@roamfit/engine';
import type { BandId, ProgressionEvent, SessionPerformance } from '@roamfit/engine';
import type { Db } from './db';
import { schema } from './db';
import { eq } from 'drizzle-orm';
import { activeElapsedSec, getSession } from './repositories/sessions';
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
  /** The band on the set that produced `bestActual` — a best set is a load *and* a number, so
   *  storing the prescribed band beside an actual rep count would record a set nobody performed. */
  bestBand: BandId | null;
  /** What the user actually trained this entry with, across its completed sets: the band used on
   *  the most of them, heaviest winning a tie (the harder claim is the safer one to carry
   *  forward). Null when no set reported a band. */
  observedBand: BandId | null;
}

/** Per-band tally over an entry's completed sets, resolved as documented on `observedBand`. */
function dominantBand(bands: (BandId | null)[]): BandId | null {
  const counts = new Map<BandId, number>();
  for (const b of bands) {
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let best: BandId | null = null;
  for (const [band, count] of counts) {
    const bestCount = best ? (counts.get(best) ?? 0) : -1;
    if (
      count > bestCount ||
      (count === bestCount && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(best!))
    ) {
      best = band;
    }
  }
  return best;
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
  let bestBand: BandId | null = null;

  for (const s of completed) {
    const actual = s.repsActual ?? s.secondsActual ?? null;
    if (actual === null || prescribed === null) continue;
    if (bestActual === null || actual > bestActual) {
      bestActual = actual;
      bestBand = s.bandActual ?? entry.band;
    }
    if (actual < prescribed) {
      anyBelowTarget = true;
      allAtOrAboveTarget = false;
    }
  }

  return {
    completedCount: completed.length,
    anyCompleted: completed.length > 0,
    anySkippedOrNotReached,
    allAtOrAboveTarget,
    anyBelowTarget,
    bestActual,
    bestBand,
    observedBand: dominantBand(completed.map((s) => s.bandActual)),
  };
}

function muscleCreditsForEntry(
  entry: SessionEntryRecord,
  exercise: Exercise | undefined,
  completedCount: number,
): MuscleVolumeEntry[] {
  if (!exercise || completedCount === 0) return [];
  const isHard = entry.difficulty === 'hard';
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

    // §10.4 — time spent paused is not time spent training, so it is subtracted here exactly as it
    // is in the elapsed timer the user watched (one shared definition, `activeElapsedSec`).
    const actualMinutes = session.startedAt
      ? activeElapsedSec(session, now) / 60
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
                  band: summary.bestBand,
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
        allSetsMetTarget: summaries.every((s) => s.allAtOrAboveTarget),
        anySetBelowTarget: summaries.some((s) => s.anyBelowTarget),
        difficultyFeedback: entries[0].difficultyFeedback ?? 'just_right',
        // What the user actually trained with, so the next prescription starts from the band in
        // their hand rather than the one they overrode (see `reconcileMicroToObservedBand`).
        // Undefined — not null — when nothing was reported: null is a meaningful "bodyweight" in
        // the engine's own band vocabulary, and this is "no correction", which is different.
        observedBand: dominantBand(summaries.map((s) => s.observedBand)) ?? undefined,
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
        recoveryWeekManual: session.recoveryWeekManual,
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
        // A session finished while paused banks that last pause rather than leaving an open one
        // on a row nothing will ever resume.
        pausedAt: null,
        pausedTotalSec: session.pausedAt
          ? session.pausedTotalSec +
            Math.max(0, Math.round((Date.parse(now) - Date.parse(session.pausedAt)) / 1000))
          : session.pausedTotalSec,
        retrospective: input.retrospective ?? null,
        updatedAt: now,
      })
      .where(eq(schema.sessions.id, session.id))
      .run();

    return { actualMinutes, progressionEvents, milestoneTypes };
  });
}

export type { SessionRecord };
