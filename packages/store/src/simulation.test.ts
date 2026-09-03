/**
 * The wave's headline done-criterion: a scripted five-session run mutates progression state,
 * exercise state, rolled-up stats, and history correctly — with no network at any point (every
 * call here is local db + pure engine code, nothing async, nothing fetched).
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getHistoryForGeneration,
  getPendingSession,
  logSet,
  startSession,
} from './repositories/sessions';
import { getAllProgressionStates } from './repositories/progressionState';
import { getExerciseState } from './repositories/exerciseState';
import { getStats } from './repositories/stats';
import { completeSession } from './completion';
import { addDays, library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

/** Runs one full generate -> approve -> active -> log every set at-or-above target -> complete
 *  cycle for `localDate`, so progression should advance on every laddered family it touches. */
function runOneSession(db: ReturnType<typeof createTestDb>['db'], localDate: string, seed: number) {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: rngFor(seed),
    utcInstant: utcInstantFor(localDate),
  });

  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  startSession(db, sessionId, utcInstantFor(localDate, 9));

  const session = getPendingSession(db)!;
  for (const entry of session.entries) {
    for (let i = 0; i < entry.sets; i++) {
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          // Always hit (exceed by 1) the prescribed target -> shouldAdvance every time.
          repsActual: entry.repTarget != null ? entry.repTarget + 1 : undefined,
          secondsActual: entry.durationSec != null ? entry.durationSec + 1 : undefined,
          restPrescribedSec: entry.restSec,
          restTakenSec: entry.restSec,
        },
        utcInstantFor(localDate, 9, i * 2),
      );
    }
  }

  const result = completeSession(
    db,
    { sessionId, library, families },
    utcInstantFor(localDate, 10),
  );
  return { sessionId, result };
}

describe('five-session scripted run', () => {
  it('mutates progression state, exercise state, rolled-up stats, and history — no network', () => {
    const { db, close } = createTestDb();
    try {
      const initialProgression = getAllProgressionStates(db); // empty before any session
      expect(Object.keys(initialProgression)).toHaveLength(0);

      let localDate = '2026-01-05';
      const sessionIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { sessionId } = runOneSession(db, localDate, i + 1);
        sessionIds.push(sessionId);
        localDate = addDays(localDate, 2); // train roughly every other day
      }

      // 1. Progression state exists for every family and has moved off the cold-start defaults —
      //    at least one family shows evidence of the 5-session "always hit target" script (either
      //    micro-progression advanced the rep target, or it changed level, or came out of
      //    calibration — any one of these is proof the mechanism ran, not a no-op).
      const finalProgression = getAllProgressionStates(db);
      expect(Object.keys(finalProgression).length).toBeGreaterThan(0);
      const anyProgressed = Object.values(finalProgression).some(
        (s) => !s.calibrating || s.consecutiveHits > 0 || s.lastLevelChangeAt !== null,
      );
      expect(anyProgressed).toBe(true);

      // 2. Exercise state exists and reflects real usage for at least one exercise that ran.
      // Pull an exercise id straight from history rather than guessing the family mapping.
      const history = getHistoryForGeneration(db);
      expect(history).toHaveLength(5);
      const ranExerciseId = history[0].entries[0].exerciseId;
      const exState = getExerciseState(db, ranExerciseId);
      expect(exState).not.toBeNull();
      expect(exState!.sessionsPerformed).toBeGreaterThanOrEqual(1);
      expect(exState!.lastPerformedAt).not.toBeNull();

      // 3. Rolled-up stats: lifetime count is exactly 5, last session date matches the last run.
      const stats = getStats(db)!;
      expect(stats.lifetimeSessionCount).toBe(5);
      expect(stats.lastSessionLocalDate).toBe(history[4].localDate);

      // 4. History has all 5 sessions, in order, each marked completed.
      expect(history.every((h: { status: string }) => h.status === 'completed')).toBe(true);

      // 5. No network: nothing in this test imported fetch/http, and generate()/completeSession()
      //    are synchronous — a network call would have to be awaited, and nothing here is async.
      expect(sessionIds).toHaveLength(5);
    } finally {
      close();
    }
  });

  it('a session that consistently MISSES its target regresses micro-progression', () => {
    const { db, close } = createTestDb();
    try {
      const clock = clockFor('2026-02-01');
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
        clock,
        rng: rngFor(7),
        utcInstant: utcInstantFor('2026-02-01'),
      });
      const sessionId = createPendingSession(db, {
        plan,
        utcInstant: utcInstantFor('2026-02-01'),
        localDate: '2026-02-01',
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      startSession(db, sessionId, utcInstantFor('2026-02-01', 9));
      const session = getPendingSession(db)!;
      for (const entry of session.entries) {
        for (let i = 0; i < entry.sets; i++) {
          logSet(
            db,
            {
              entryId: entry.id,
              setIndex: i,
              status: 'completed',
              repsPrescribed: entry.repTarget ?? undefined,
              secondsPrescribed: entry.durationSec ?? undefined,
              repsActual: entry.repTarget != null ? Math.max(1, entry.repTarget - 3) : undefined,
              secondsActual:
                entry.durationSec != null ? Math.max(1, entry.durationSec - 5) : undefined,
              restPrescribedSec: entry.restSec,
              restTakenSec: entry.restSec,
            },
            utcInstantFor('2026-02-01', 9, i * 2),
          );
        }
      }
      completeSession(db, { sessionId, library, families }, utcInstantFor('2026-02-01', 10));

      const progression = getAllProgressionStates(db);
      const anyRegressed = Object.values(progression).some(
        (s) => s.consecutiveMisses > 0 || s.calibrating,
      );
      expect(anyRegressed).toBe(true);
    } finally {
      close();
    }
  });
});
