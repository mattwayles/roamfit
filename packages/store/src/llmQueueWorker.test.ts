import { createTestDb } from './testHarness';
import { generate } from './generation';
import { createPendingSession, getSession } from './repositories/sessions';
import { getSignalEventsForSession } from './repositories/signals';
import {
  enqueueDeferredWork,
  getEligibleDeferredWork,
  getPendingDeferredWork,
} from './repositories/queues';
import { processLlmQueue, type LlmProxyCaller } from './llmQueueWorker';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

function makeSession(db: ReturnType<typeof createTestDb>['db'], localDate = '2026-04-01') {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
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
  return sessionId;
}

describe('§11.3 LLM queue worker', () => {
  it('createPendingSession enqueues an llm_coach_voice job durably, without touching the network', () => {
    const { db } = createTestDb();
    const sessionId = makeSession(db);
    const eligible = getEligibleDeferredWork(db, utcInstantFor('2026-04-01'));
    expect(eligible.some((j) => j.kind === 'llm_coach_voice' && j.sessionId === sessionId)).toBe(
      true,
    );
  });

  it('applies a successful coach-voice result to the session and marks the job done', async () => {
    const { db } = createTestDb();
    const sessionId = makeSession(db);
    const originalExplanation = getSession(db, sessionId)!.explanation;

    const caller: LlmProxyCaller = {
      coachVoice: jest.fn().mockResolvedValue({
        explanation: 'A warm rewritten coach line.',
        usedFallback: false,
      }),
      distillFeedback: jest.fn(),
    };

    const result = await processLlmQueue(db, utcInstantFor('2026-04-01'), caller);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const session = getSession(db, sessionId)!;
    expect(session.explanation).toBe('A warm rewritten coach line.');
    expect(session.explanation).not.toBe(originalExplanation);
    expect(session.generatedBy).toBe('engine+llm');
    expect(getPendingDeferredWork(db).some((j) => j.sessionId === sessionId)).toBe(false);
  });

  // The deterministic-floor guarantee: even when the caller's own result says it fell back
  // (validation failed inside the Cloud Function, per §7.3), the worker just applies whatever
  // explanation came back — which the job contract guarantees is never worse than the
  // deterministic original. This test pins that the worker itself adds no extra risk on top.
  it('still marks the job done when the caller reports its own internal fallback', async () => {
    const { db } = createTestDb();
    const sessionId = makeSession(db);
    const deterministic = getSession(db, sessionId)!.explanation;

    const caller: LlmProxyCaller = {
      coachVoice: jest.fn().mockResolvedValue({ explanation: deterministic, usedFallback: true }),
      distillFeedback: jest.fn(),
    };

    await processLlmQueue(db, utcInstantFor('2026-04-01'), caller);
    expect(getPendingDeferredWork(db).some((j) => j.sessionId === sessionId)).toBe(false);
  });

  // §11.3's actual guarantee under a network failure: never blocks anything, never throws past
  // this call, and the job stays pending for a later retry (exponential backoff handled by
  // `repositories/queues.ts`, already tested there). Fails if the try/catch around the caller is
  // ever removed.
  it('a caller that throws (network failure) leaves the job pending for retry rather than crashing', async () => {
    const { db } = createTestDb();
    const sessionId = makeSession(db);

    const caller: LlmProxyCaller = {
      coachVoice: jest.fn().mockRejectedValue(new Error('network unreachable')),
      distillFeedback: jest.fn(),
    };

    await expect(processLlmQueue(db, utcInstantFor('2026-04-01'), caller)).resolves.toBeDefined();
    const pending = getPendingDeferredWork(db).find((j) => j.sessionId === sessionId);
    expect(pending).toBeDefined();
    expect(pending!.attempts).toBe(1);
    // And it must NOT be immediately eligible again — it's now backing off.
    expect(getEligibleDeferredWork(db, utcInstantFor('2026-04-01'))).not.toContainEqual(
      expect.objectContaining({ sessionId }),
    );
  });

  it('logs a validated distillation result as a signal event and marks the job done', async () => {
    const { db } = createTestDb();
    const sessionId = makeSession(db);

    const caller: LlmProxyCaller = {
      coachVoice: jest.fn(),
      distillFeedback: jest.fn().mockResolvedValue({
        suspectedLimitationTag: 'knee_impact',
        bandTooLightExerciseIds: [],
        aversionExerciseIds: [],
      }),
    };

    // Manually enqueue a distillation job the way completion.ts does, since this test only wants
    // to exercise the distillation path in isolation.
    const now = utcInstantFor('2026-04-01');
    enqueueDeferredWork(db, 'llm_distillation', sessionId, { retrospective: 'my knee hurt' }, now);

    await processLlmQueue(db, now, caller);

    const events = getSignalEventsForSession(db, sessionId);
    const distillEvent = events.find((e) => e.type === 'llm_distillation_result');
    expect(distillEvent).toBeDefined();
    expect(distillEvent!.payload).toEqual({
      suspectedLimitationTag: 'knee_impact',
      bandTooLightExerciseIds: [],
      aversionExerciseIds: [],
    });
  });

  it('is a no-op success when the session has since been discarded/removed', async () => {
    const { db } = createTestDb();
    // A job pointing at a session id that never existed (simulating a discarded session whose
    // row was later cleaned up) — must resolve cleanly, not throw.
    enqueueDeferredWork(db, 'llm_coach_voice', 'no-such-session', {}, utcInstantFor('2026-04-01'));

    const caller: LlmProxyCaller = { coachVoice: jest.fn(), distillFeedback: jest.fn() };
    const result = await processLlmQueue(db, utcInstantFor('2026-04-01'), caller);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);
    expect(caller.coachVoice).not.toHaveBeenCalled();
  });
});
