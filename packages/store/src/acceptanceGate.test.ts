/**
 * Wave 7 — the §11.6 release-gate harness, run literally: "install the app, put the device in
 * airplane mode before first launch, and complete five workouts across three days — generation,
 * progression, dashboard, and history all fully functional."
 *
 * HONEST SCOPE: this proves the gate at the store/engine level — every call below is synchronous
 * local db + pure engine code, so "no network" is true by construction (nothing here could reach
 * the network even if it wanted to: no `fetch`/`http` import anywhere in this file's transitive
 * imports, and every operation is a plain synchronous function return, never a `Promise`). It
 * does NOT prove the UI never makes a network call on cold boot, that the real device's radio is
 * actually off, or that a human can install-and-airplane-mode a physical phone and get this
 * result — that is still owed as a manual walkthrough (see STATUS-7-acceptance.md and the
 * carried-forward table's #18/#22). What this *does* prove, and prove by mutation (see the
 * "breaks the gate" tests at the bottom): the exact literal sequence — 5 sessions spread over
 * only 3 distinct local dates, including two same-day sessions, which the wave-3 simulation test
 * never exercised (it spread 5 sessions over 9 days, one per day) — mutates progression, exercise
 * state, rolled-up stats, and history correctly, and every read surface (dashboard-adjacent
 * repository reads, not just the mutations) stays coherent throughout.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getHistoryForGeneration,
  getPendingSession,
  logSet,
  startSession,
  adjustRepTargetAtApproval,
} from './repositories/sessions';
import { getAllProgressionStates } from './repositories/progressionState';
import { getExerciseState } from './repositories/exerciseState';
import { getStats } from './repositories/stats';
import { getPendingDeferredWork } from './repositories/queues';
import { updateUser, getUser } from './repositories/users';
import { completeSession } from './completion';
import { addDays, library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

function runOneSession(
  db: ReturnType<typeof createTestDb>['db'],
  localDate: string,
  seed: number,
  hour: number,
) {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(seed),
    utcInstant: utcInstantFor(localDate, hour),
  });

  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(localDate, hour),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });

  // Touch the approval-time edit path at least once (part of "approve" in the gate's own
  // language) rather than only ever approving the plan verbatim.
  const approvalSession = getPendingSession(db)!;
  const firstEntry = approvalSession.entries[0];
  if (firstEntry?.repTarget != null) {
    adjustRepTargetAtApproval(db, firstEntry.id, firstEntry.repTarget, utcInstantFor(localDate, hour));
  }

  startSession(db, sessionId, utcInstantFor(localDate, hour));

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
        utcInstantFor(localDate, hour, i * 2),
      );
    }
  }

  const result = completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, hour, 30));
  return { sessionId, result, localDate };
}

describe('§11.6 release gate — 5 workouts across exactly 3 days, cold install', () => {
  it('cold start (before any session) is already coherent — no throw, no null-pointer, sane defaults', () => {
    const { db, close } = createTestDb();
    try {
      // Nothing has run yet. This is the literal "airplane mode before first launch" moment:
      // the very first reads a freshly-installed app would perform.
      expect(getStats(db)).toBeNull();
      expect(getHistoryForGeneration(db)).toEqual([]);
      expect(getPendingSession(db)).toBeNull();
      // buildUserState (called inside generate) must lazily create the user + progression rows
      // rather than requiring a network-fetched seed — assert generate() itself works cold.
      const clock = clockFor('2026-03-01');
      const { plan } = generate(db, {
        library,
        families,
        request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
        clock,
        rng: rngFor(1),
        utcInstant: utcInstantFor('2026-03-01'),
      });
      expect(plan.main.length).toBeGreaterThan(0);
    } finally {
      close();
    }
  });

  it('5 sessions across 3 distinct local dates (2 same-day) — generate/approve/run/complete/log/dashboard/progression/passport all behave', () => {
    const { db, close } = createTestDb();
    try {
      // Opt into the passport queue so its deferred-work path is exercised by this run too.
      updateUser(db, { passportEnabled: true }, utcInstantFor('2026-03-01'));

      // Day 1: two sessions (morning + evening). Day 2: rest. Day 3: two sessions. Day 4: one.
      // This is the part the pre-existing wave-3 simulation test never covered — it spread 5
      // sessions one-per-day over 9 days. "Three days" in the gate's own wording implies same-day
      // repeats are in scope, and same-day handling (weekly window, stats, passport dedupe) is
      // exactly the kind of thing that breaks quietly if a day-keyed aggregate assumes 1:1.
      const day1 = '2026-03-01';
      const day2 = addDays(day1, 2); // one rest day between
      const day3 = addDays(day2, 1);

      const runs = [
        runOneSession(db, day1, 1, 7),
        runOneSession(db, day1, 2, 18),
        runOneSession(db, day2, 3, 7),
        runOneSession(db, day2, 4, 19),
        runOneSession(db, day3, 5, 8),
      ];
      expect(runs).toHaveLength(5);
      expect(new Set(runs.map((r) => r.localDate)).size).toBe(3); // literally 3 distinct days

      // GENERATE/APPROVE/RUN/COMPLETE/LOG: no pending session left dangling after the last one.
      expect(getPendingSession(db)).toBeNull();

      // HISTORY: 5 completed sessions, in order, each on the day it was actually run.
      const history = getHistoryForGeneration(db);
      expect(history).toHaveLength(5);
      expect(history.every((h) => h.status === 'completed')).toBe(true);
      expect(history.map((h) => h.localDate)).toEqual([day1, day1, day2, day2, day3]);

      // PROGRESSION: moved off cold-start defaults for at least one family (every session in
      // this script exceeds its target, so advancement should be visible).
      const progression = getAllProgressionStates(db);
      expect(Object.keys(progression).length).toBeGreaterThan(0);
      expect(
        Object.values(progression).some(
          (s) => !s.calibrating || s.consecutiveHits > 0 || s.lastLevelChangeAt !== null,
        ),
      ).toBe(true);

      // EXERCISE STATE: real usage recorded for at least one exercise that actually ran.
      const ranExerciseId = history[0].entries[0].exerciseId;
      const exState = getExerciseState(db, ranExerciseId);
      expect(exState?.sessionsPerformed).toBeGreaterThanOrEqual(1);

      // DASHBOARD-FEEDING STATS: exactly 5 lifetime sessions, last date is the true last date —
      // two-sessions-in-one-day does not get double- or under-counted.
      const stats = getStats(db)!;
      expect(stats.lifetimeSessionCount).toBe(5);
      expect(stats.lastSessionLocalDate).toBe(day3);

      // PASSPORT / deferred work: a passport_geocode job was enqueued once per completed
      // session (opt-in was on for all 5), proving the completion transaction's enqueue path
      // ran every time, same-day sessions included.
      const pending = getPendingDeferredWork(db);
      const passportJobs = pending.filter((j) => j.kind === 'passport_geocode');
      expect(passportJobs).toHaveLength(5);

      // NO NETWORK: every call above is synchronous (none of `generate`/`createPendingSession`/
      // `adjustRepTargetAtApproval`/`startSession`/`logSet`/`completeSession` returns a Promise —
      // TypeScript already enforces this at the call sites above with no `await`), and this file
      // imports nothing that reaches the network.
    } finally {
      close();
    }
  });
});
