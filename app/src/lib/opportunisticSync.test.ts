/**
 * §11.3/invariant 1 — `runOpportunisticSync` is the one place all three background workers
 * (`processDeviceQueue`, `runFirestoreSync`, and — issue #34 — `processLlmQueue`) get called, and
 * it is only ever invoked from `HomeScreen.tsx`'s screen-focus effect, never from the
 * generate/approve/run/complete/log critical path. This test proves it never throws — not even
 * when every worker and every caller factory fails — which is what makes it safe to fire-and-forget
 * from a screen effect at all.
 *
 * Verified by mutation (see STATUS-6f-deploy.md): removing the `try/catch` around the
 * `processLlmQueue` call makes the "LLM caller factory throwing" case in this file fail
 * immediately with an unhandled rejection, confirming this test exercises a real guard rather
 * than a tautology.
 */
import { runOpportunisticSync } from './opportunisticSync';

jest.mock('@roamfit/store', () => ({
  processDeviceQueue: jest.fn(() => Promise.reject(new Error('device queue: no connectivity'))),
  runFirestoreSync: jest.fn(() => Promise.reject(new Error('firestore: no connectivity'))),
  processLlmQueue: jest.fn(() => Promise.reject(new Error('llm proxy: unreachable'))),
}));
jest.mock('./healthKit', () => ({ healthKitWriter: {} }));
jest.mock('./geocode', () => ({ geocodeCaller: {} }));
jest.mock('./firestoreSyncClient', () => ({
  createFirestoreSyncClient: jest.fn(() => {
    throw new Error('firestore client: not configured');
  }),
}));
jest.mock('./llmProxyClient', () => ({
  createLlmProxyCaller: jest.fn(() => {
    throw new Error('llm proxy client: not configured');
  }),
}));

describe('runOpportunisticSync', () => {
  it('never throws, even when every worker rejects and every caller factory throws', async () => {
    const db = {} as unknown as Parameters<typeof runOpportunisticSync>[0];
    await expect(runOpportunisticSync(db, '2026-09-01T00:00:00.000Z')).resolves.toBeUndefined();
  });

  it('never throws when the caller factories return null (unconfigured) instead of throwing', async () => {
    const { createFirestoreSyncClient } = jest.requireMock('./firestoreSyncClient') as {
      createFirestoreSyncClient: jest.Mock;
    };
    const { createLlmProxyCaller } = jest.requireMock('./llmProxyClient') as {
      createLlmProxyCaller: jest.Mock;
    };
    createFirestoreSyncClient.mockReturnValue(null);
    createLlmProxyCaller.mockReturnValue(null);

    const db = {} as unknown as Parameters<typeof runOpportunisticSync>[0];
    await expect(runOpportunisticSync(db, '2026-09-01T00:00:00.000Z')).resolves.toBeUndefined();

    const { processLlmQueue, runFirestoreSync } = jest.requireMock('@roamfit/store') as {
      processLlmQueue: jest.Mock;
      runFirestoreSync: jest.Mock;
    };
    // A null caller/client means the worker must not even be attempted.
    expect(processLlmQueue).not.toHaveBeenCalled();
    expect(runFirestoreSync).not.toHaveBeenCalled();
  });
});
