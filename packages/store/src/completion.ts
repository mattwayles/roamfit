/**
 * §10.9 completion — one transaction: write history (by flipping the session to `completed`,
 * §11.3 append-only), persist feedback (already applied per-set/per-entry as it happened —
 * nothing left to do here but read it back), apply progression updates (§6.3/§6.7 via the
 * engine's own `applySessionResult`), update exercise state, write milestone rows, update
 * rolled-up stats, and enqueue (never await) deferred work. Must succeed with zero connectivity
 * (§11.1) — nothing here does I/O beyond the local db.
 */
import type { Exercise, ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import {
  addDays,
  applyAccessorySessionResult,
  applySessionResult,
  sessionsPerStepFor,
  usableBands,
  BAND_ORDER,
  isPassedRungBandExercise,
  progressesAsAccessory,
  REPEAT_SKIP_THRESHOLD,
  seedAccessoryMicro,
  shouldSuppressForRepeatedSkip,
  SUPPRESSION_DAYS,
} from '@roamfit/engine';
import type {
  BandId,
  DifficultyFeedback,
  ProgressionEvent,
  SessionPerformance,
} from '@roamfit/engine';
import type { Db } from './db';
import { schema } from './db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { activeElapsedSec, getSession, sessionEndInstant } from './repositories/sessions';
import type { SessionEntryRecord, SessionRecord } from './repositories/sessions';
import { getAllProgressionStates, upsertProgressionState } from './repositories/progressionState';
import { getUser, ensureUser, markHasEverCompletedSession } from './repositories/users';
import {
  getAllExerciseStates,
  getExerciseState,
  incrementSkipCount,
  recordAccessoryProgression,
  recordExercisePerformed,
  setSuppressedUntil,
} from './repositories/exerciseState';
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
  /** The band the entry's last completed set was done on (reported, else prescribed) — where the
   *  user ended up, which is what the next prescription of an accessory starts from. Unlike
   *  `observedBand` this is not a tally: moving up a band on set 3 of 3 is the user saying where
   *  they belong, and a majority vote of the two lighter sets before it would throw that away. */
  finalBand: BandId | null;
  /** Every completed set was done on `finalBand` — the accessory ladder keeps a rep target met on a
   *  heavier band only when the whole entry was done on it. */
  finalBandHeldThroughout: boolean;
  /** The entry's own answer to "how did those sets feel" (one per exercise); `just_right` when
   *  unanswered. §6.3's advance/regress rules see one verdict per entry. */
  difficultyFeedback: DifficultyFeedback;
}

/** Worst case across several entries of one family — `too_hard` beats `too_easy` beats
 *  `just_right`, and an entry with no answer (`null`) never overrides one that has an opinion. */
function worstDifficulty(feedbacks: (DifficultyFeedback | null)[]): DifficultyFeedback {
  if (feedbacks.includes('too_hard')) return 'too_hard';
  if (feedbacks.includes('too_easy')) return 'too_easy';
  return 'just_right';
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

  const last = [...completed].sort((a, b) => b.setIndex - a.setIndex)[0];
  const finalBand = last ? (last.bandActual ?? entry.band) : null;

  return {
    completedCount: completed.length,
    anyCompleted: completed.length > 0,
    anySkippedOrNotReached,
    allAtOrAboveTarget,
    anyBelowTarget,
    bestActual,
    bestBand,
    observedBand: dominantBand(completed.map((s) => s.bandActual)),
    finalBand,
    finalBandHeldThroughout: completed.every((s) => (s.bandActual ?? entry.band) === finalBand),
    difficultyFeedback: entry.difficultyFeedback ?? 'just_right',
  };
}

/** Whether this entry climbs its exercise's own ladder at completion (`progression/accessory.ts`):
 *  main work with no progression family (not cardio), or a band exercise drawn from a rung below its
 *  family's current one. A passed-rung entry still carries its family id (charts read it) but is
 *  judged against its own ladder, not the current rung's. */
function climbsOwnLadder(
  entry: SessionEntryRecord,
  exercise: Exercise | undefined,
  families: FamilyLibrary,
): boolean {
  if (!exercise || entry.section !== 'main') return false;
  if (!entry.progressionFamilyId) return progressesAsAccessory(exercise);
  const family = families.families.find((f) => f.id === entry.progressionFamilyId);
  return (
    !!family &&
    !!entry.progressionLevelIdAtTime &&
    isPassedRungBandExercise(exercise, family, entry.progressionLevelIdAtTime)
  );
}

/**
 * Apply one accessory entry's session to its exercise's ladder and store the result.
 *
 * An exercise not on the ladder yet starts from this entry's own prescription (`seedFrom`
 * chooses the band: `'remembered'` takes the stored working band where there is one, so a
 * recovery-day drop is not mistaken for where the user belongs; `'prescribed'` takes the entry's,
 * for history recorded before working bands existed).
 *
 * The band the user finished on only counts as a change when it differs from what *this session*
 * prescribed. Following a recovery-dropped band is following the plan, not choosing lighter.
 */
function progressAccessoryEntry(
  db: Db,
  entry: SessionEntryRecord,
  exercise: Exercise,
  summary: WorkingSetSummary,
  now: string,
  seedFrom: 'remembered' | 'prescribed',
  sessionsPerStep: number,
  usable?: readonly BandId[],
): void {
  const stored = getExerciseState(db, entry.exerciseId);
  const micro =
    stored?.accessoryMicro ??
    seedAccessoryMicro(exercise, {
      repTarget: entry.repTarget,
      durationSec: entry.durationSec,
      tempoSec: entry.tempoSec,
      restSec: entry.restSec,
      sets: entry.sets,
      band: (seedFrom === 'remembered' ? stored?.workingBand : null) ?? entry.band,
    });
  const changedBand = summary.finalBand !== entry.band;
  const result = applyAccessorySessionResult(
    {
      micro,
      consecutiveMisses: stored?.accessoryMisses ?? 0,
      consecutiveHits: stored?.accessoryHits ?? 0,
    },
    exercise,
    {
      allSetsMetTarget: summary.allAtOrAboveTarget,
      anySetBelowTarget: summary.anyBelowTarget,
      difficultyFeedback: summary.difficultyFeedback,
      finalBand: changedBand ? summary.finalBand : undefined,
      finalBandHeldThroughout: summary.finalBandHeldThroughout,
    },
    sessionsPerStep,
    usable,
  );
  recordAccessoryProgression(db, entry.exerciseId, result.state, now);
}

/**
 * Put every exercise already trained as an accessory onto its ladder, from its most recent
 * completed accessory session — the one-time catch-up for history recorded before accessories had
 * a ladder (migration 0028). Replays that session's verdict, so a "just right, every set met" from
 * before the update still earns its step. Idempotent: an exercise with a ladder position is
 * skipped, so after the first run this is one query. Called by `generate` before it reads state.
 */
export function seedAccessoryProgressionFromHistory(
  db: Db,
  library: ExerciseLibrary,
  now: string,
): void {
  const states = getAllExerciseStates(db);
  const rows = db
    .select({
      exerciseId: schema.sessionEntries.exerciseId,
      sessionId: schema.sessionEntries.sessionId,
      entryId: schema.sessionEntries.id,
    })
    .from(schema.sessionEntries)
    .innerJoin(schema.sessions, eq(schema.sessions.id, schema.sessionEntries.sessionId))
    .where(
      and(
        eq(schema.sessions.status, 'completed'),
        eq(schema.sessionEntries.section, 'main'),
        isNull(schema.sessionEntries.progressionFamilyId),
      ),
    )
    .orderBy(desc(schema.sessions.completedAt))
    .all();

  const settled = new Set<string>();
  for (const row of rows) {
    if (settled.has(row.exerciseId)) continue;
    const exercise = library.exercises.find((e) => e.id === row.exerciseId);
    if (states[row.exerciseId]?.accessoryMicro || !exercise || !progressesAsAccessory(exercise)) {
      settled.add(row.exerciseId);
      continue;
    }
    const entry = getSession(db, row.sessionId)?.entries.find((e) => e.id === row.entryId);
    if (!entry || entry.entryStatus === 'removed_at_approval') continue;
    const summary = summarizeEntry(entry);
    if (!summary.anyCompleted) continue; // nothing performed here — try an older session
    settled.add(row.exerciseId);
    // A one-time catch-up replaying a verdict from before accessories had a ladder: it earns its
    // one step, as documented above, whatever pace the user has since chosen.
    progressAccessoryEntry(db, entry, exercise, summary, now, 'prescribed', 1);
  }
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
    // is in the elapsed timer the user watched (one shared definition, `activeElapsedSec`). The
    // clock stops at the last completed set, so a forgotten Stop can't inflate the total.
    const actualMinutes = session.startedAt
      ? activeElapsedSec(session, sessionEndInstant(session.entries, now)) / 60
      : session.estimatedMinutes;

    const progressionEvents: { familyId: string; event: ProgressionEvent }[] = [];
    const milestoneTypes: string[] = [];
    const muscleVolume: MuscleVolumeEntry[] = [];

    const progressionStates = getAllProgressionStates(txDb);
    // Track 37f — the user's progression pace: how many qualifying sessions one step takes.
    const progressUser = getUser(txDb) ?? ensureUser(txDb, now);
    const sessionsPerStep = sessionsPerStepFor(progressUser.trainingPreferences.pace);
    // Track 37i — ladders step only through bands this user can be given.
    const usable = usableBands(progressUser.bandSettings);
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
            // Warm-up/cool-down sets are prep, not training — they never count toward a best set.
            bestPerformance:
              exercise && entry.section === 'main'
                ? {
                    reps:
                      exercise.metric === 'time' ? undefined : (summary.bestActual ?? undefined),
                    seconds:
                      exercise.metric === 'time' ? (summary.bestActual ?? undefined) : undefined,
                    band: summary.bestBand,
                  }
                : undefined,
            // Main work only: a warm-up/cool-down band is deliberately below working load. An
            // accessory's band is the ladder's call, written by `progressAccessoryEntry` below.
            workingBand:
              entry.section === 'main' && !climbsOwnLadder(entry, exercise, input.families)
                ? summary.finalBand
                : undefined,
          },
          now,
        );
        if (climbsOwnLadder(entry, exercise, input.families)) {
          progressAccessoryEntry(
            txDb,
            entry,
            exercise!,
            summary,
            now,
            'remembered',
            sessionsPerStep,
            usable,
          );
        }
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
        // §5.2 REPEATEDLY-SKIPPED, the half the engine can't do for itself: it only ever *reads*
        // `suppressedUntil`, and completion is the only moment that knows a skip just happened.
        // Without this the skip counter accumulated forever and nothing ever acted on it.
        //
        // Read back after the increment so the count includes this session's skip, and re-set the
        // window on every further skip past the threshold rather than only on the crossing — an
        // exercise the user keeps refusing should keep its distance, not quietly return 30 days
        // after the second refusal.
        const skipState = getExerciseState(txDb, entry.exerciseId);
        if (skipState && shouldSuppressForRepeatedSkip(skipState, REPEAT_SKIP_THRESHOLD)) {
          setSuppressedUntil(
            txDb,
            entry.exerciseId,
            addDays(session.localDate, SUPPRESSION_DAYS),
            now,
          );
        }
      }

      muscleVolume.push(...muscleCreditsForEntry(entry, exercise, summary.completedCount));

      // A passed-rung entry's performance is about its own ladder; it says nothing about whether the
      // user has met the current rung, so it stays out of the family's verdict.
      if (entry.progressionFamilyId && !climbsOwnLadder(entry, exercise, input.families)) {
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
        // One answer per exercise; when a family had several entries this session, the worst case
        // among them.
        difficultyFeedback: worstDifficulty(summaries.map((s) => s.difficultyFeedback)),
        // What the user actually trained with, so the next prescription starts from the band in
        // their hand rather than the one they overrode (see `reconcileMicroToObservedBand`).
        // Undefined — not null — when nothing was reported: null is a meaningful "bodyweight" in
        // the engine's own band vocabulary, and this is "no correction", which is different.
        observedBand: dominantBand(summaries.map((s) => s.observedBand)) ?? undefined,
        // Which sibling the ladder actually handed them, so `observedBand` is read against the
        // range that exercise is authored for rather than the level anchor's (ADR 0010).
        programmedExerciseId: entries[0].exerciseId,
      };

      const result = applySessionResult(state, family, input.library.exercises, perf, {
        sessionsPerStep,
        usableBands: usable,
      });
      upsertProgressionState(txDb, result.state, now);
      progressionEvents.push({ familyId, event: result.event });

      if (result.event.kind === 'level_up') {
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

    // `recordSessionCompletion` just above already incremented `lifetimeSessionCount` to include
    // *this* session — reading it back here and adding another +1 double-counted, so the quiet
    // "Session #N" milestone read one higher than the completion banner's own
    // `countCompletedSessions(db)` on the same screen. `stats.lifetimeSessionCount` is already
    // the right N.
    const stats = getStats(txDb);
    milestoneTypes.push('nth_session');
    addMilestone(
      txDb,
      {
        type: 'nth_session',
        payload: { n: stats?.lifetimeSessionCount ?? 1 },
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
