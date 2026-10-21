/**
 * §11.3/invariant 1 — `runOpportunisticSync` drains the device queue (HealthKit write, passport
 * geocode) and is only ever invoked from `HomeScreen.tsx`'s screen-focus effect, never from the
 * generate/approve/run/complete/log critical path. This test proves it never throws, even when
 * the drain rejects, which is what makes it safe to fire-and-forget from a screen effect at all.
 */
import { runOpportunisticSync } from './opportunisticSync';

jest.mock('@roamfit/store', () => ({
  processDeviceQueue: jest.fn(() => Promise.reject(new Error('device queue: unavailable'))),
}));
jest.mock('./healthKit', () => ({ healthKitWriter: {} }));
jest.mock('./geocode', () => ({ geocodeCaller: {} }));

describe('runOpportunisticSync', () => {
  it('never throws, even when the device queue drain rejects', async () => {
    const db = {} as unknown as Parameters<typeof runOpportunisticSync>[0];
    await expect(runOpportunisticSync(db, '2026-09-01T00:00:00.000Z')).resolves.toBeUndefined();
  });
});
