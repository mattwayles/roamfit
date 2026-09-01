import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getPendingSession,
  getSession,
  logSet,
  startSession,
} from './repositories/sessions';
import { completeSession } from './completion';
import { updateUser } from './repositories/users';
import { getAllMilestones } from './repositories/milestones';
import { getEligibleDeferredWork, getPendingDeferredWork } from './repositories/queues';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';
import {
  processDeviceQueue,
  ESTIMATED_KCAL_PER_MINUTE,
  type HealthKitWriter,
  type GeocodeCaller,
} from './deviceQueueWorker';

/** Generates, runs, and completes a session with both healthkit write and passport enabled, so
 *  both a `healthkit_write` and a `passport_geocode` job land in `deferred_work` — the same
 *  opt-in path `completion.test.ts` already covers for enqueueing; this file covers *draining*. */
function completeAnOptedInSession(
  db: ReturnType<typeof createTestDb>['db'],
  localDate: string,
  actualBonus = 0,
) {
  updateUser(db, { healthWriteEnabled: true, passportEnabled: true }, utcInstantFor(localDate));
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
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
  return sessionId;
}

function healthKitThatSucceeds(): { writer: HealthKitWriter; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    writer: {
      writeWorkout: async (input) => {
        calls.push(input);
      },
    },
    calls,
  };
}

function healthKitThatIsDeniedSilently(): HealthKitWriter {
  // Models the app-side contract exactly: a denial/unavailability resolves normally, having
  // internally done nothing. The worker cannot tell this apart from a real write — by design.
  return { writeWorkout: async () => undefined };
}

function healthKitThatFails(): HealthKitWriter {
  return {
    writeWorkout: async () => {
      throw new Error('unexpected native failure');
    },
  };
}

function geocodeThatResolves(city: string, country: string): GeocodeCaller {
  return { reverseGeocode: async () => ({ city, country }) };
}

function geocodeThatFails(): GeocodeCaller {
  return {
    reverseGeocode: async () => {
      throw new Error('no connectivity');
    },
  };
}

describe('§13.4 HealthKit write queue', () => {
  it('a successful write marks the job done and passes duration/estimated energy through', async () => {
    const { db } = createTestDb();
    const sessionId = completeAnOptedInSession(db, '2026-09-01');
    const { writer, calls } = healthKitThatSucceeds();
    const now = utcInstantFor('2026-09-01', 11);

    const result = await processDeviceQueue(
      db,
      now,
      writer,
      geocodeThatResolves('Lisbon', 'Portugal'),
    );
    expect(result.succeeded).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    const call = calls[0] as { durationSec: number; activeEnergyKcal: number };
    expect(call.durationSec).toBeGreaterThan(0);
    expect(call.activeEnergyKcal).toBeGreaterThan(0);

    // Job is gone from the eligible/pending queue — done, not retried.
    const remaining = getEligibleDeferredWork(db, now).filter(
      (j) => j.kind === 'healthkit_write' && j.sessionId === sessionId,
    );
    expect(remaining).toHaveLength(0);
  });

  it('the estimated energy uses the documented kcal/minute constant, not a fabricated number', async () => {
    const { db } = createTestDb();
    completeAnOptedInSession(db, '2026-09-01');
    const { writer, calls } = healthKitThatSucceeds();
    await processDeviceQueue(
      db,
      utcInstantFor('2026-09-01', 11),
      writer,
      geocodeThatResolves('Lisbon', 'Portugal'),
    );
    const call = calls[0] as { durationSec: number; activeEnergyKcal: number };
    const expectedMinutes = call.durationSec / 60;
    expect(call.activeEnergyKcal).toBe(Math.round(expectedMinutes * ESTIMATED_KCAL_PER_MINUTE));
  });

  it('denial/unavailability is a SILENT no-op — the job is marked done, never retried, never surfaced as a failure', async () => {
    const { db } = createTestDb();
    const sessionId = completeAnOptedInSession(db, '2026-09-01');
    const now = utcInstantFor('2026-09-01', 11);

    const result = await processDeviceQueue(
      db,
      now,
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );

    const healthkitOutcome = result; // both kinds ran in this pass; check succeeded, not failedOrRetrying
    expect(healthkitOutcome.failedOrRetrying).toBe(0);
    const remaining = getEligibleDeferredWork(db, now).filter(
      (j) => j.kind === 'healthkit_write' && j.sessionId === sessionId,
    );
    expect(remaining).toHaveLength(0); // done, not pending-and-waiting-to-retry
    const stillPending = getPendingDeferredWork(db).filter(
      (j) => j.kind === 'healthkit_write' && j.sessionId === sessionId,
    );
    expect(stillPending).toHaveLength(0);
  });

  it('a genuine native write failure (never denial) IS retried via the existing backoff queue', async () => {
    const { db } = createTestDb();
    completeAnOptedInSession(db, '2026-09-01');
    const now = utcInstantFor('2026-09-01', 11);

    const result = await processDeviceQueue(
      db,
      now,
      healthKitThatFails(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );
    expect(result.failedOrRetrying).toBeGreaterThan(0);
    // Still pending (not done, not silently dropped) — eligible again once its backoff elapses.
    const stillPending = getPendingDeferredWork(db).filter((j) => j.kind === 'healthkit_write');
    expect(stillPending).toHaveLength(1);
    expect(stillPending[0].attempts).toBe(1);
  });
});

describe('§9.6/§11.3 location queue — pinned to the session local_date, not the resolution date', () => {
  it('a geocode resolved days later still lands on the session own local_date', async () => {
    const { db } = createTestDb();
    const sessionId = completeAnOptedInSession(db, '2026-09-01');
    // Resolves three days later, in a different local_date entirely — the offline-at-completion
    // case §11.3 describes explicitly.
    const resolvedAt = utcInstantFor('2026-09-04', 8);

    await processDeviceQueue(
      db,
      resolvedAt,
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );

    const session = getSession(db, sessionId)!;
    expect(session.city).toBe('Lisbon');
    expect(session.country).toBe('Portugal');
    expect(session.localDate).toBe('2026-09-01'); // untouched — fixed at creation.

    const milestones = getAllMilestones(db).filter((m) => m.type === 'new_city');
    expect(milestones).toHaveLength(1);
    // The milestone itself is pinned to the session's local_date, not 2026-09-04.
    expect(milestones[0].localDate).toBe('2026-09-01');
  });

  it('a second session in a city already visited does not fire a second new_city milestone', async () => {
    const { db } = createTestDb();
    completeAnOptedInSession(db, '2026-09-01');
    await processDeviceQueue(
      db,
      utcInstantFor('2026-09-01', 11),
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );

    completeAnOptedInSession(db, '2026-09-05', 1);
    await processDeviceQueue(
      db,
      utcInstantFor('2026-09-05', 11),
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );

    const milestones = getAllMilestones(db).filter((m) => m.type === 'new_city');
    expect(milestones).toHaveLength(1);
  });

  it('a genuinely new city (different from every prior completed session) fires its own milestone', async () => {
    const { db } = createTestDb();
    completeAnOptedInSession(db, '2026-09-01');
    await processDeviceQueue(
      db,
      utcInstantFor('2026-09-01', 11),
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Lisbon', 'Portugal'),
    );

    completeAnOptedInSession(db, '2026-09-08', 1);
    await processDeviceQueue(
      db,
      utcInstantFor('2026-09-08', 11),
      healthKitThatIsDeniedSilently(),
      geocodeThatResolves('Porto', 'Portugal'),
    );

    const milestones = getAllMilestones(db).filter((m) => m.type === 'new_city');
    expect(milestones.map((m) => m.payload.city).sort()).toEqual(['Lisbon', 'Porto']);
  });

  it('a geocode failure (offline) leaves the job pending for retry, never throws, never fabricates a location', async () => {
    const { db } = createTestDb();
    const sessionId = completeAnOptedInSession(db, '2026-09-01');
    const now = utcInstantFor('2026-09-01', 11);

    const result = await processDeviceQueue(
      db,
      now,
      healthKitThatIsDeniedSilently(),
      geocodeThatFails(),
    );
    expect(result.failedOrRetrying).toBeGreaterThan(0);
    const session = getSession(db, sessionId)!;
    expect(session.city).toBeNull();
    expect(session.country).toBeNull();
    const stillPending = getPendingDeferredWork(db).filter((j) => j.kind === 'passport_geocode');
    expect(stillPending).toHaveLength(1);
  });
});

describe('§11.1 offline safety — a fully offline device queue pass never throws and never blocks', () => {
  it('both jobs failing (no connectivity for either) still returns a normal result object', async () => {
    const { db } = createTestDb();
    completeAnOptedInSession(db, '2026-09-01');
    const now = utcInstantFor('2026-09-01', 11);
    const result = await processDeviceQueue(db, now, healthKitThatFails(), geocodeThatFails());
    expect(result.processed).toBe(2);
    expect(result.failedOrRetrying).toBe(2);
    expect(result.succeeded).toBe(0);
  });

  it('a queue with nothing opted-in enqueued is a true no-op (opt-in only, §13.5)', async () => {
    const { db } = createTestDb();
    // No updateUser call — healthWriteEnabled/passportEnabled stay at their default false.
    const clock = clockFor('2026-09-01');
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library,
      families,
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock,
      rng: rngFor(1),
      utcInstant: utcInstantFor('2026-09-01'),
    });
    const sessionId = createPendingSession(db, {
      plan,
      utcInstant: utcInstantFor('2026-09-01'),
      localDate: '2026-09-01',
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    startSession(db, sessionId, utcInstantFor('2026-09-01', 9));
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
            restTakenSec: entry.restSec,
          },
          utcInstantFor('2026-09-01', 9, i * 2),
        );
      }
    }
    completeSession(db, { sessionId, library, families }, utcInstantFor('2026-09-01', 10));

    const result = await processDeviceQueue(
      db,
      utcInstantFor('2026-09-01', 11),
      healthKitThatFails(),
      geocodeThatFails(),
    );
    expect(result.processed).toBe(0);
  });
});
