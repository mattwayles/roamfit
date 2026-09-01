/**
 * §13.4 HealthKit write — the `deviceQueueWorker.ts` (`@roamfit/store`) `HealthKitWriter` seam,
 * implemented against `@kingstinct/react-native-healthkit`. Write only, never read (invariant:
 * health data never leaves the device, and this app never calls any `query*`/`get*` function
 * from that library — only `requestAuthorization({ toShare: [...] })` and `saveWorkoutSample`).
 *
 * Lazy-loaded exactly like `expo-network` in `networkStatus.ts` and `expo-audio` in
 * `workoutAudio.ts`: the native module isn't registered under Jest, so a static top-level import
 * would throw the moment this file is required by a test.
 *
 * **The denial/unavailability contract (§13.4: "denial or unavailability must be a no-op, never
 * an error the user sees") lives entirely here.** `writeWorkout` below only ever *rejects* for a
 * genuinely unexpected failure; every anticipated "can't write" path — no HealthKit on this
 * device (e.g. iPad, simulator), authorization never requested, authorization denied — resolves
 * normally having done nothing. `deviceQueueWorker.ts`'s contract test pins this at the interface
 * level; this file is the one place that contract is actually implemented against the real API,
 * which is unverifiable here (no device/simulator in this environment — see
 * STATUS-6d-sync-health.md).
 */
import type { HealthKitWriter } from '@roamfit/store';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

let moduleCache: HealthKitModule | null | undefined;

function loadHealthKitModule(): HealthKitModule | null {
  if (moduleCache !== undefined) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('@kingstinct/react-native-healthkit') as HealthKitModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

let authorizationRequested = false;

/** Call once, e.g. from a settings toggle when the user opts into HealthKit write — mirrors the
 *  passport opt-in toggle already in `HomeScreen.tsx`. Requests write-only ("toShare") access to
 *  workouts and active energy; never requests read access to anything (§13.4/§13.5). Never
 *  throws: a rejected/unavailable request just means every future `writeWorkout` call is the
 *  no-op path below. */
export async function requestHealthKitWritePermission(): Promise<void> {
  const hk = loadHealthKitModule();
  if (!hk) return;
  try {
    const available = await hk.isHealthDataAvailable();
    if (!available) return;
    await hk.requestAuthorization({
      toShare: ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
    });
    authorizationRequested = true;
  } catch {
    // Denial, or any other failure asking — leave `authorizationRequested` false. The next
    // `writeWorkout` call will simply no-op via the module-unavailable/not-yet-authorized path.
  }
}

/** The real `HealthKitWriter` implementation. `@roamfit/store`'s `deviceQueueWorker.ts` calls
 *  this with an estimated duration/energy for a completed session; it is never told whether the
 *  write actually happened, by design (see file header). */
export const healthKitWriter: HealthKitWriter = {
  async writeWorkout(input) {
    const hk = loadHealthKitModule();
    if (!hk) return; // module unavailable (e.g. under Jest, or a non-iOS/misconfigured build).
    if (!authorizationRequested) return; // never asked, or asking failed/was denied — silent no-op.

    try {
      const available = await hk.isHealthDataAvailable();
      if (!available) return; // e.g. iPad, or an iOS version/device without HealthKit.

      const startDate = new Date(input.startedAt);
      const endDate = new Date(startDate.getTime() + input.durationSec * 1000);
      await hk.saveWorkoutSample(
        hk.WorkoutActivityType.functionalStrengthTraining,
        [
          {
            startDate,
            endDate,
            quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
            quantity: input.activeEnergyKcal,
            unit: 'kcal',
          },
        ],
        startDate,
        endDate,
      );
    } catch {
      // A genuine failure at this point (not a denial — that already short-circuited above via
      // `authorizationRequested`/`isHealthDataAvailable`) is real product signal, so this is the
      // one case that's allowed to throw — deviceQueueWorker.ts treats a thrown error as
      // retryable and re-queues it with backoff, same as a network failure.
      throw new Error('HealthKit write failed');
    }
  },
};
