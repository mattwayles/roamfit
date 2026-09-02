/**
 * §10.4 the workout-level pause. It used to be component state on the workout screen, so the
 * elapsed clock kept running while "paused" and the pause vanished when the screen unmounted.
 * These are the two facts that fix that: paused time is banked on the session row, and every
 * consumer of "how long has this taken" subtracts it.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  activeElapsedSec,
  createPendingSession,
  getPendingSession,
  getSession,
  logSet,
  pauseSession,
  resumeSession,
  startSession,
} from './repositories/sessions';
import { completeSession } from './completion';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

const DATE = '2026-03-01';

/** `utcInstantFor` only takes hours and minutes, which is coarse for a stopwatch — this offsets a
 *  base instant by whole seconds instead. */
function atSecond(second: number): string {
  return new Date(Date.parse(utcInstantFor(DATE, 9)) + second * 1000).toISOString();
}

function startedSession(db: Db): string {
  const clock = clockFor(DATE);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(DATE),
  });
  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(DATE),
    localDate: DATE,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  startSession(db, sessionId, atSecond(0));
  return sessionId;
}

describe('§10.4 pausing an active workout', () => {
  it('stops the elapsed clock while paused, and restarts it on resume', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);

      // 60s of training, then paused.
      pauseSession(db, sessionId, atSecond(60));
      const paused = getSession(db, sessionId)!;
      expect(paused.pausedAt).toBe(atSecond(60));
      // Five minutes later the clock has not moved — this is the actual bug being fixed.
      expect(activeElapsedSec(paused, atSecond(360))).toBe(60);

      resumeSession(db, sessionId, atSecond(360));
      const resumed = getSession(db, sessionId)!;
      expect(resumed.pausedAt).toBeNull();
      expect(resumed.pausedTotalSec).toBe(300);
      expect(activeElapsedSec(resumed, atSecond(360))).toBe(60);
      // ...and time counts again from there.
      expect(activeElapsedSec(resumed, atSecond(390))).toBe(90);
    } finally {
      close();
    }
  });

  it('banks every pause, so repeated pausing does not lose the time in between', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      pauseSession(db, sessionId, atSecond(10));
      resumeSession(db, sessionId, atSecond(40)); // 30s paused
      pauseSession(db, sessionId, atSecond(50));
      resumeSession(db, sessionId, atSecond(70)); // 20s paused

      const session = getSession(db, sessionId)!;
      expect(session.pausedTotalSec).toBe(50);
      expect(activeElapsedSec(session, atSecond(70))).toBe(20);
    } finally {
      close();
    }
  });

  it('is idempotent in both directions, so a double tap cannot lose banked time', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      pauseSession(db, sessionId, atSecond(10));
      pauseSession(db, sessionId, atSecond(20)); // ignored: the open pause still starts at 10s
      expect(getSession(db, sessionId)!.pausedAt).toBe(atSecond(10));

      resumeSession(db, sessionId, atSecond(40));
      resumeSession(db, sessionId, atSecond(90)); // ignored: nothing is open to resume
      expect(getSession(db, sessionId)!.pausedTotalSec).toBe(30);
    } finally {
      close();
    }
  });

  it('survives a re-read of the session, because it lives on the row and not on a screen', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      pauseSession(db, sessionId, atSecond(30));
      // `getPendingSession` is the path Home uses to resume a workout after navigating away.
      const reloaded = getPendingSession(db)!;
      expect(reloaded.id).toBe(sessionId);
      expect(reloaded.pausedAt).toBe(atSecond(30));
    } finally {
      close();
    }
  });

  it('excludes paused time from the session’s recorded duration', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
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
              repsActual: entry.repTarget ?? undefined,
              secondsActual: entry.durationSec ?? undefined,
              restPrescribedSec: entry.restSec,
            },
            atSecond(60),
          );
        }
      }
      // 20 minutes wall-clock, 12 of them paused.
      pauseSession(db, sessionId, atSecond(300));
      resumeSession(db, sessionId, atSecond(1020));

      const { actualMinutes } = completeSession(
        db,
        { sessionId, library, families },
        atSecond(1200),
      );
      expect(actualMinutes).toBeCloseTo(8, 5);
    } finally {
      close();
    }
  });

  it('closes an open pause when the session is completed while paused', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const session = getPendingSession(db)!;
      logSet(
        db,
        {
          entryId: session.entries[0].id,
          setIndex: 0,
          status: 'completed',
          repsPrescribed: session.entries[0].repTarget ?? undefined,
          repsActual: session.entries[0].repTarget ?? undefined,
          restPrescribedSec: session.entries[0].restSec,
        },
        atSecond(60),
      );
      pauseSession(db, sessionId, atSecond(120));

      const { actualMinutes } = completeSession(
        db,
        { sessionId, library, families },
        atSecond(600),
      );
      expect(actualMinutes).toBeCloseTo(2, 5); // only the 120s before the pause counts
      const completed = getSession(db, sessionId)!;
      expect(completed.pausedAt).toBeNull();
      expect(completed.pausedTotalSec).toBe(480);
    } finally {
      close();
    }
  });
});
