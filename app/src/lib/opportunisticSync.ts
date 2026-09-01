/**
 * §11.3 — the one place this track wires its workers (`processDeviceQueue`, `runFirestoreSync`,
 * and — closing issue #34 — `processLlmQueue`) into the app. Called opportunistically (screen
 * focus today; a real connectivity-restored/foreground listener is a reasonable next step, not
 * added here to keep this track's app-side footprint small) — **never on the critical path**.
 * `runOpportunisticSync` itself never throws and is meant to be fired-and-forgotten
 * (`void runOpportunisticSync(db, now)`).
 *
 * Each worker is isolated in its own try/catch, same as before: a coach line or distilled signal
 * that never arrives (proxy unreachable, key unset, `createLlmProxyCaller()` returns `null`
 * because no Firebase project is configured) is a silent, accepted outcome — never a blocked
 * generate/approve/run/complete/log/dashboard (invariant 1).
 */
import { processDeviceQueue, processLlmQueue, runFirestoreSync } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { healthKitWriter } from './healthKit';
import { geocodeCaller } from './geocode';
import { createFirestoreSyncClient } from './firestoreSyncClient';
import { createLlmProxyCaller } from './llmProxyClient';

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

  try {
    const caller = createLlmProxyCaller();
    if (caller) await processLlmQueue(db, now, caller);
  } catch {
    // Same — a network failure inside a single job is already absorbed by `processLlmQueue`
    // itself (it records backoff and returns normally); this outer catch is only a backstop for
    // something failing before that, e.g. `createLlmProxyCaller()` throwing during lazy module
    // load. Either way, coach voice/distillation are best-effort and never allowed to disturb
    // the caller.
  }
}
