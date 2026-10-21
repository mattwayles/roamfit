/**
 * §11.3 — the one place the device queue (`processDeviceQueue`: HealthKit write, passport
 * geocode) is wired into the app. Called opportunistically (Home screen focus) — **never on the
 * critical path**. `runOpportunisticSync` itself never throws and is meant to be
 * fired-and-forgotten (`void runOpportunisticSync(db, now)`).
 *
 * A queue drain that fails (HealthKit denied, geocoder unreachable) is a silent, accepted outcome
 * — never a blocked generate/approve/run/complete/log/dashboard (invariant 1).
 */
import { processDeviceQueue } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { healthKitWriter } from './healthKit';
import { geocodeCaller } from './geocode';

export async function runOpportunisticSync(db: Db, now: string): Promise<void> {
  try {
    await processDeviceQueue(db, now, healthKitWriter, geocodeCaller);
  } catch {
    // Never throws to the caller — a queue drain failing is an accepted, silent outcome (§11.1).
  }
}
