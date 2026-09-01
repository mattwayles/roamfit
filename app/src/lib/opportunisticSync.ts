/**
 * §11.3 — the one place this track wires its two workers (`processDeviceQueue`,
 * `runFirestoreSync`) into the app. Called opportunistically (screen focus today; a real
 * connectivity-restored/foreground listener is a reasonable next step, not added here to keep
 * this track's app-side footprint small) — **never on the critical path**. `runOpportunisticSync`
 * itself never throws and is meant to be fired-and-forgotten (`void runOpportunisticSync(db)`),
 * exactly like `processLlmQueue` is documented to be called once `app/`-side LLM wiring exists
 * (issue #34 — explicitly not this track's job, so it is *not* called from here).
 *
 * Deliberately does **not** wire `processLlmQueue` — that queue's app-side HTTP caller doesn't
 * exist yet (issue #34), and pulling it in here would be exactly the scope creep the brief warns
 * against ("don't expand scope; say so if you leave it").
 */
import { processDeviceQueue, runFirestoreSync } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { healthKitWriter } from './healthKit';
import { geocodeCaller } from './geocode';
import { createFirestoreSyncClient } from './firestoreSyncClient';

export async function runOpportunisticSync(db: Db, now: string): Promise<void> {
  try {
    await processDeviceQueue(db, now, healthKitWriter, geocodeCaller);
  } catch {
    // Never throws to the caller — a queue drain failing is an accepted, silent outcome (§11.1).
  }

  try {
    const client = createFirestoreSyncClient();
    if (client) await runFirestoreSync(db, client);
  } catch {
    // Same — Firestore is a sync target only, never allowed to disturb the UI thread it's
    // called from.
  }
}
