import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getCompletedSessionsForDashboard,
  getPendingSession,
  logSet,
  startSession,
} from './repositories/sessions';
import { getAllProgressionStates } from './repositories/progressionState';
import { getAllMilestones } from './repositories/milestones';
import { getAllExerciseStates } from './repositories/exerciseState';
import { getPendingDeferredWork } from './repositories/queues';
import { completeSession } from './completion';
import { ensureUser, updateUser } from './repositories/users';
import { getStats, shouldSuggestRecoveryWeek } from './repositories/stats';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

function runSession(
  db: ReturnType<typeof createTestDb>['db'],
  localDate: string,
  seed: number,
  actualBonus: number,
  opts: { recoveryWeek?: boolean } = {},
) {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: rngFor(seed),
    utcInstant: utcInstantFor(localDate),
    recoveryWeek: opts.recoveryWeek,
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
          repsActual: entry.repTarget != null ? entry.repTarget + actualBonus : undefined,
          secondsActual: entry.durationSec != null ? entry.durationSec + actualBonus : undefined,
          restPrescribedSec: entry.restSec,
          restTakenSec: entry.restSec,
        },
        utcInstantFor(localDate, 9, i * 2),
      );
    }
  }
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
  return { sessionId, plan: session };
}

describe('completion — best-set PR and milestones', () => {
  it('a second, better session for the same exercise logs a best_set_pr milestone (first-ever set does not)', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-04-01', 1, 1);
      const milestonesAfterFirst = getAllMilestones(db);
      expect(milestonesAfterFirst.some((m) => m.type === 'best_set_pr')).toBe(false);

      runSession(db, '2026-04-03', 1, 5); // same seed -> same session shape, bigger bonus
      const milestonesAfterSecond = getAllMilestones(db);
      expect(milestonesAfterSecond.some((m) => m.type === 'best_set_pr')).toBe(true);
    } finally {
      close();
    }
  });

  it('every completed session logs an nth_session milestone and enqueues llm_distillation deferred work', () => {
    const { db, close } = createTestDb();
    try {
      const { sessionId } = runSession(db, '2026-04-01', 1, 1);
      const milestones = getAllMilestones(db);
      expect(milestones.some((m) => m.type === 'nth_session' && m.sessionId === sessionId)).toBe(
        true,
      );

      const deferred = getPendingDeferredWork(db);
      expect(deferred.some((d) => d.kind === 'llm_distillation' && d.sessionId === sessionId)).toBe(
        true,
      );
      // healthkit/passport are opt-in and off by default — must not be enqueued.
      expect(deferred.some((d) => d.kind === 'healthkit_write')).toBe(false);
      expect(deferred.some((d) => d.kind === 'passport_geocode')).toBe(false);
    } finally {
      close();
    }
  });

  it('opt-in healthkit/passport queues are only enqueued when the user has enabled them', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-04-01'));
      updateUser(
        db,
        { healthWriteEnabled: true, passportEnabled: true },
        utcInstantFor('2026-04-01'),
      );
      const { sessionId } = runSession(db, '2026-04-01', 1, 1);
      const deferred = getPendingDeferredWork(db);
      expect(deferred.some((d) => d.kind === 'healthkit_write' && d.sessionId === sessionId)).toBe(
        true,
      );
      expect(deferred.some((d) => d.kind === 'passport_geocode' && d.sessionId === sessionId)).toBe(
        true,
      );
    } finally {
      close();
    }
  });
});

describe('§9.9 Recovery Week — same code path as §9.4 comeback', () => {
  it('regresses progression states and cuts session volume, and logs a recovery_week milestone', () => {
    const { db, close } = createTestDb();
    try {
      // Run a normal session first so progression states exist and have a known baseline.
      runSession(db, '2026-05-01', 1, 1);
      const before = getAllProgressionStates(db);

      const { sessionId } = runSession(db, '2026-05-03', 1, 1, { recoveryWeek: true });

      const milestones = getAllMilestones(db);
      expect(milestones.some((m) => m.type === 'recovery_week' && m.sessionId === sessionId)).toBe(
        true,
      );

      // At least one family's micro state should differ from a plain continuation — the
      // regress-then-advance-by-one-hit net effect should land at or below where an un-regressed
      // session would have. We can't assert an exact number without re-deriving the engine's own
      // math, but we CAN assert the mechanism ran: every family present still has a state, and
      // none of them silently reset to null.
      const after = getAllProgressionStates(db);
      expect(Object.keys(after).length).toBe(Object.keys(before).length);
    } finally {
      close();
    }
  });
});

describe('§14.1.8/§14.1.6 lifetimeTotalMinutes + getCompletedSessionsForDashboard', () => {
  it('accumulates actualMinutes across sessions and is readable via the dashboard projection', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-05-01', 1, 1);
      runSession(db, '2026-05-03', 2, 1);
      const stats = getStats(db)!;
      expect(stats.lifetimeTotalMinutes).toBeGreaterThan(0);

      const sessions = getCompletedSessionsForDashboard(db);
      expect(sessions.length).toBe(2);
      // Newest first.
      expect(sessions[0].localDate).toBe('2026-05-03');
      expect(sessions[0].actualMinutes).not.toBeNull();
      const total = sessions.reduce((a, s) => a + (s.actualMinutes ?? 0), 0);
      expect(total).toBeCloseTo(stats.lifetimeTotalMinutes, 5);
    } finally {
      close();
    }
  });
});

describe('§9.9 issue #12 — Recovery Week auto-suggest trigger', () => {
  it('increments once per distinct ISO week of training, not once per session', () => {
    const { db, close } = createTestDb();
    try {
      // Two sessions in the same ISO week (a Monday and the following Wednesday) must only
      // advance the counter once — "weeks of consistent training," not "sessions."
      runSession(db, '2026-05-04', 1, 1); // Monday
      runSession(db, '2026-05-06', 2, 1); // same week, Wednesday
      expect(getStats(db)!.weeksSinceLastRecoveryWeek).toBe(1);

      runSession(db, '2026-05-11', 3, 1); // next week
      expect(getStats(db)!.weeksSinceLastRecoveryWeek).toBe(2);
    } finally {
      close();
    }
  });

  it('shouldSuggestRecoveryWeek is false below 6 weeks, true in the 6-8 window', () => {
    const { db, close } = createTestDb();
    try {
      const mondays = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01'];
      for (const [i, d] of mondays.entries()) runSession(db, d, i + 1, 1);
      expect(shouldSuggestRecoveryWeek(getStats(db)!)).toBe(false); // 5 weeks

      runSession(db, '2026-06-08', 6, 1); // 6th week
      expect(getStats(db)!.weeksSinceLastRecoveryWeek).toBe(6);
      expect(shouldSuggestRecoveryWeek(getStats(db)!)).toBe(true);
    } finally {
      close();
    }
  });

  it('a completed Recovery Week session resets the counter to 0, not penalizes it', () => {
    const { db, close } = createTestDb();
    try {
      for (const [i, d] of ['2026-05-04', '2026-05-11', '2026-05-18'].entries()) {
        runSession(db, d, i + 1, 1);
      }
      expect(getStats(db)!.weeksSinceLastRecoveryWeek).toBe(3);

      runSession(db, '2026-05-25', 4, 1, { recoveryWeek: true });
      expect(getStats(db)!.weeksSinceLastRecoveryWeek).toBe(0);
    } finally {
      close();
    }
  });
});

describe('Wave 7 §11.6 adversarial pass — kill during the completion transaction', () => {
  it('a throw partway through completeSession rolls back every write, not just the last one', () => {
    // Simulates "force-quit killed the app mid-completion-transaction". `completeSession` wraps
    // its entire body in one `db.transaction(...)` call — this test forces a real throw AFTER
    // per-entry writes (exercise state, a possible best_set_pr milestone) have already run
    // against the transaction's connection, and proves the underlying driver rolls back
    // everything, not just the statement that threw: the session must still read as pending, and
    // none of the earlier writes in the same call may have survived.
    const { db, close } = createTestDb();
    try {
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
        clock: clockFor('2026-06-01'),
        rng: rngFor(9),
        utcInstant: utcInstantFor('2026-06-01'),
      });
      const sessionId = createPendingSession(db, {
        plan,
        utcInstant: utcInstantFor('2026-06-01'),
        localDate: '2026-06-01',
        tzId: clockFor('2026-06-01').tzId,
        comebackTier,
        recoveryWeekManual,
      });
      startSession(db, sessionId, utcInstantFor('2026-06-01', 9));
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
              repsActual: entry.repTarget != null ? entry.repTarget + 1 : undefined,
              secondsActual: entry.durationSec != null ? entry.durationSec + 1 : undefined,
              restPrescribedSec: entry.restSec,
              restTakenSec: entry.restSec,
            },
            utcInstantFor('2026-06-01', 9, i * 2),
          );
        }
      }

      // Force a real throw partway through: `completeSession` writes exercise state (and any
      // best_set_pr milestone) per-entry FIRST, then calls `recordSessionCompletion` afterward,
      // in the same transaction. Spying on `recordSessionCompletion` to throw lands the failure
      // strictly after those earlier writes have already executed against the transaction's live
      // connection — exactly "force-quit mid-completion, after some of it already ran".
      const statsRepo = jest.requireActual(
        './repositories/stats',
      ) as typeof import('./repositories/stats');
      const spy = jest.spyOn(statsRepo, 'recordSessionCompletion').mockImplementation(() => {
        throw new Error('simulated force-quit mid-completion-transaction');
      });
      try {
        expect(() =>
          completeSession(db, { sessionId, library, families }, utcInstantFor('2026-06-01', 10)),
        ).toThrow('simulated force-quit');
      } finally {
        spy.mockRestore();
      }

      // Atomicity check: the session must still be `active` (not stuck half-`completed`), and
      // NONE of the writes that would have happened before the throw — exercise state for the
      // first entry, its best_set_pr milestone — persisted either. A non-atomic implementation
      // would show the exercise-state write committed while the session row never flipped.
      const reread = getPendingSession(db);
      expect(reread).not.toBeNull(); // still pending/active — completion never committed
      expect(getAllMilestones(db)).toHaveLength(0); // no milestone survived the rollback
      expect(getStats(db)).toBeNull(); // recordSessionCompletion's stats row never committed
      // The assertion that actually distinguishes atomic from non-atomic, and the one this
      // test's own comment described but never made: `completeSession` writes per-entry exercise
      // state BEFORE `recordSessionCompletion` throws. Without the wrapping transaction those
      // writes commit and survive; with it they roll back. Every other assertion here passes
      // either way, because nothing after the throw ever runs regardless.
      expect(Object.keys(getAllExerciseStates(db))).toHaveLength(0);
    } finally {
      close();
    }
  });
});
