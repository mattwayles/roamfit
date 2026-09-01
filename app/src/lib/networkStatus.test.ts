/**
 * `expo-network` has no native module registered under Jest — confirmed by direct probing
 * (`getNetworkStateAsync()` resolves to `undefined`, it doesn't throw at the call site, unlike
 * `expo-audio`'s throw-on-require). This test locks in the resulting safe-default behavior so a
 * future change to the lazy-load guard can't silently start throwing or "assuming online."
 */
import { getNetworkStatus } from './networkStatus';

describe('getNetworkStatus under Jest (no native module)', () => {
  it('never throws and resolves to the safe (offline, unmetered) default', async () => {
    await expect(getNetworkStatus()).resolves.toEqual({ online: false, metered: false });
  });
});
