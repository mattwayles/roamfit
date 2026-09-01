import { createTestDb } from '../testHarness';
import {
  enqueueDeferredWork,
  getEligibleDeferredWork,
  getPendingDeferredWork,
  markDeferredWorkDone,
  recordDeferredWorkFailure,
} from './queues';

const T0 = '2026-09-01T10:00:00.000Z';

describe('§11.3 deferred work queue — exponential backoff', () => {
  it('a freshly enqueued job is immediately eligible', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_coach_voice', 'session-1', {}, T0);
    expect(getEligibleDeferredWork(db, T0)).toHaveLength(1);
  });

  it('after a failure, the job is NOT eligible again until its backoff delay has elapsed', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_coach_voice', 'session-1', {}, T0);
    const [job] = getEligibleDeferredWork(db, T0);
    recordDeferredWorkFailure(db, job!.id, T0);

    // Still within the backoff window (2^1 = 2 minutes out) — must not be eligible.
    const oneMinuteLater = '2026-09-01T10:01:00.000Z';
    expect(getEligibleDeferredWork(db, oneMinuteLater)).toHaveLength(0);
    // A job that's still pending-but-not-yet-eligible is still counted by the unfiltered view —
    // this is what distinguishes "gone" (done/failed) from "waiting its turn."
    expect(getPendingDeferredWork(db)).toHaveLength(1);

    // Past the backoff window — eligible again.
    const threeMinutesLater = '2026-09-01T10:03:00.000Z';
    expect(getEligibleDeferredWork(db, threeMinutesLater)).toHaveLength(1);
  });

  it('the backoff delay doubles with each successive failure (2^attempts minutes)', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_distillation', 'session-1', {}, T0);
    const [job] = getEligibleDeferredWork(db, T0);

    let t = T0;
    for (let attempt = 1; attempt <= 4; attempt++) {
      recordDeferredWorkFailure(db, job!.id, t, { capMinutes: 100_000 });
      const delayMinutes = 2 ** attempt;
      const justBefore = new Date(
        new Date(t).getTime() + delayMinutes * 60_000 - 1000,
      ).toISOString();
      const justAfter = new Date(
        new Date(t).getTime() + delayMinutes * 60_000 + 1000,
      ).toISOString();
      expect(getEligibleDeferredWork(db, justBefore)).toHaveLength(0);
      expect(getEligibleDeferredWork(db, justAfter)).toHaveLength(1);
      // Advance "now" to just after this attempt's window before triggering the next failure, so
      // each loop iteration measures that attempt's own delay in isolation.
      t = justAfter;
    }
  });

  it('the backoff delay is capped at capMinutes', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_distillation', 'session-1', {}, T0);
    const [job] = getEligibleDeferredWork(db, T0);
    // attempts will reach 5 -> 2^5 = 32 minutes uncapped; cap it to 10.
    for (let i = 0; i < 4; i++) recordDeferredWorkFailure(db, job!.id, T0, { capMinutes: 10 });

    const justUnderTenMinutes = '2026-09-01T10:09:59.000Z';
    expect(getEligibleDeferredWork(db, justUnderTenMinutes)).toHaveLength(0);
    const tenMinutesLater = '2026-09-01T10:10:00.000Z';
    expect(getEligibleDeferredWork(db, tenMinutesLater)).toHaveLength(1);
  });

  // §11.3's actual product guarantee: a job that keeps failing must eventually stop retrying
  // forever (it is marked 'failed' and drops out of both the eligible and pending views) rather
  // than either blocking anything or retrying infinitely. Fails if the maxAttempts cutoff is
  // ever removed.
  it('permanently fails (and stops appearing as pending) after maxAttempts', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_coach_voice', 'session-1', {}, T0);
    const [job] = getEligibleDeferredWork(db, T0);

    let t = T0;
    for (let i = 0; i < 3; i++) {
      recordDeferredWorkFailure(db, job!.id, t, { maxAttempts: 3, capMinutes: 1 });
      t = new Date(new Date(t).getTime() + 5 * 60_000).toISOString();
    }

    expect(getPendingDeferredWork(db)).toHaveLength(0);
    expect(getEligibleDeferredWork(db, t)).toHaveLength(0);
  });

  it('a successful job is marked done and disappears from both pending and eligible views', () => {
    const { db } = createTestDb();
    enqueueDeferredWork(db, 'llm_coach_voice', 'session-1', {}, T0);
    const [job] = getEligibleDeferredWork(db, T0);
    markDeferredWorkDone(db, job!.id, T0);

    expect(getPendingDeferredWork(db)).toHaveLength(0);
    expect(getEligibleDeferredWork(db, T0)).toHaveLength(0);
  });

  it('a failure never throws even for an id that does not exist (queue processing must never crash)', () => {
    const { db } = createTestDb();
    expect(() => recordDeferredWorkFailure(db, 'no-such-id', T0)).not.toThrow();
  });
});
