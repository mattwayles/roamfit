/**
 * `@kingstinct/react-native-healthkit` throws at `require()` time under Jest (its native
 * NitroModules module isn't linked — confirmed by direct probing, same class of finding as
 * `networkStatus.test.ts`'s header comment for `expo-network`). This test locks in that
 * `healthKitWriter.writeWorkout` degrades to a silent no-op (never throws to the caller) when the
 * module can't load — the exact §13.4 "unavailability is a no-op" contract, exercised here
 * against the real lazy-load guard rather than a mock.
 */
import { healthKitWriter, requestHealthKitWritePermission } from './healthKit';

describe('healthKitWriter under Jest (no native module)', () => {
  it('requestHealthKitWritePermission never throws when the module is unavailable', async () => {
    await expect(requestHealthKitWritePermission()).resolves.toBeUndefined();
  });

  it('writeWorkout never throws when the module is unavailable — the required no-op path', async () => {
    await expect(
      healthKitWriter.writeWorkout({
        startedAt: '2026-09-01T09:00:00.000Z',
        durationSec: 1800,
        activeEnergyKcal: 150,
      }),
    ).resolves.toBeUndefined();
  });

  it('writeWorkout is still a no-op even after requesting permission, since the module never loaded', async () => {
    await requestHealthKitWritePermission();
    await expect(
      healthKitWriter.writeWorkout({
        startedAt: '2026-09-01T09:00:00.000Z',
        durationSec: 1800,
        activeEnergyKcal: 150,
      }),
    ).resolves.toBeUndefined();
  });
});
