/**
 * `expo-location`'s JS module loads fine under Jest (unlike the HealthKit Nitro module) but every
 * native function resolves to `undefined` rather than throwing — confirmed by direct probing.
 * `geocodeCaller.reverseGeocode` must treat that as "can't complete right now" (rejects, so
 * `deviceQueueWorker.ts` retries via the existing backoff queue) rather than crashing on a
 * `.status` read of `undefined` or silently fabricating a location.
 */
import { geocodeCaller, requestLocationPermission } from './geocode';

describe('geocodeCaller under Jest (no native module)', () => {
  it('requestLocationPermission never throws when the native module is unavailable', async () => {
    await expect(requestLocationPermission()).resolves.toBeUndefined();
  });

  it('reverseGeocode rejects (never resolves with a fabricated location) when permission cannot be confirmed', async () => {
    await expect(geocodeCaller.reverseGeocode()).rejects.toThrow();
  });
});
