/**
 * §13.4/§9.6/§11.3 device queue worker — drains the `healthkit_write`/`passport_geocode` rows
 * `completion.ts` already writes durably to `deferred_work` (opt-in only: `user.healthWriteEnabled`
 * / `user.passportEnabled`), using the same exponential-backoff `deferred_work` machinery
 * `llmQueueWorker.ts` established. Mirrors that worker's shape deliberately: an injected
 * interface per job kind so `packages/store` never imports a native HealthKit module or a
 * geocoding client — `app/` implements both against the real device APIs.
 *
 * Two behaviors this worker exists specifically to get right, because both are named in the
 * verification bar:
 *  - **HealthKit denial/unavailability must be a silent no-op, never an error the user sees**
 *    (§13.4). The contract lives entirely in `HealthKitWriter.writeWorkout`'s resolve/reject
 *    split: resolving (even having internally done nothing because permission was denied or the
 *    API is unavailable, e.g. the simulator) marks the job done; only a genuine thrown error
 *    (a real transient failure) triggers backoff. The app-side implementation is responsible for
 *    catching a permission-denial at the native layer and resolving anyway — this worker cannot
 *    tell the difference between "wrote successfully" and "silently skipped because denied," by
 *    design, because the user must never see either case differently.
 *  - **A queued geocode result is pinned to the session's own `local_date`, never the resolution
 *    date** (§11.3, invariant 6). This worker does not decide the date at all — `applyGeocodeResult`
 *    (`repositories/sessions.ts`) reads it straight off the session row, which was fixed at
 *    creation time and is never touched by this worker or by how long the job sat in the queue.
 */
import type { Db } from './db';
import { getSession, applyGeocodeResult } from './repositories/sessions';
import {
  getEligibleDeferredWork,
  markDeferredWorkDone,
  recordDeferredWorkFailure,
  type DeferredWorkRecord,
} from './repositories/queues';

/** The seam `app/` implements against `@kingstinct/react-native-healthkit` (or equivalent).
 *  `writeWorkout` must never reject for permission-denied or HealthKit-unavailable — those are
 *  defined outcomes, not failures (§13.4: "denial or unavailability must be a no-op, never an
 *  error the user sees"). Only reject for a genuine, unexpected failure — e.g. the native call
 *  itself threw for a reason unrelated to authorization. */
export interface HealthKitWriter {
  writeWorkout(input: {
    startedAt: string;
    durationSec: number;
    activeEnergyKcal: number;
  }): Promise<void>;
}

/** The seam `app/` implements against `expo-location` (or equivalent). Reject when the lookup
 *  cannot complete right now (no connectivity, no permission determination possible, no GPS fix)
 *  — that's the one signal this worker treats as retryable, exactly like `LlmProxyCaller`. */
export interface GeocodeCaller {
  reverseGeocode(): Promise<{ city: string; country: string }>;
}

export interface ProcessDeviceQueueResult {
  processed: number;
  succeeded: number;
  failedOrRetrying: number;
}

/** §13.4 — a reasonable, undocumented-in-spec estimate: ~5 kcal/min of banded/bodyweight
 *  resistance training. Not a MET-table computation (no heart rate, weight, or intensity signal
 *  available in v1) — "an estimated active-energy value" is exactly what §13.4 asks for, not a
 *  clinically precise one. Documented here per CLAUDE.md rather than silently guessed. */
export const ESTIMATED_KCAL_PER_MINUTE = 5;

async function processOne(
  db: Db,
  job: DeferredWorkRecord,
  healthKit: HealthKitWriter,
  geocode: GeocodeCaller,
  now: string,
): Promise<'succeeded' | 'failed'> {
  const session = getSession(db, job.sessionId);
  if (!session) {
    // Discarded before this job ran — nothing left to write/pin. Terminal, not a failure.
    markDeferredWorkDone(db, job.id, now);
    return 'succeeded';
  }

  try {
    if (job.kind === 'healthkit_write') {
      const actualMinutes = (job.payload as { actualMinutes?: number }).actualMinutes ?? 0;
      await healthKit.writeWorkout({
        startedAt: session.startedAt ?? session.utcInstant,
        durationSec: Math.round(actualMinutes * 60),
        activeEnergyKcal: Math.round(actualMinutes * ESTIMATED_KCAL_PER_MINUTE),
      });
      markDeferredWorkDone(db, job.id, now);
      return 'succeeded';
    }

    if (job.kind === 'passport_geocode') {
      const result = await geocode.reverseGeocode();
      applyGeocodeResult(db, job.sessionId, result, now);
      markDeferredWorkDone(db, job.id, now);
      return 'succeeded';
    }

    // Any other kind (llm_coach_voice, llm_distillation) is out of scope — llmQueueWorker's.
    return 'succeeded';
  } catch {
    // No connectivity for the geocode, or a genuine HealthKit write failure (never a denial —
    // see the HealthKitWriter contract above). The only retryable case.
    recordDeferredWorkFailure(db, job.id, now);
    return 'failed';
  }
}

/** Drains every eligible `healthkit_write`/`passport_geocode` job. `app/` decides when to call
 *  this (foreground, connectivity-restored) — never on the critical path of generate/approve/
 *  run/complete/log (invariant 1). Both jobs are opt-in (§13.4/§13.5): a user who never enabled
 *  HealthKit write or the Passport has nothing enqueued in either kind to begin with
 *  (`completion.ts` only enqueues when `user.healthWriteEnabled`/`user.passportEnabled`). */
export async function processDeviceQueue(
  db: Db,
  now: string,
  healthKit: HealthKitWriter,
  geocode: GeocodeCaller,
): Promise<ProcessDeviceQueueResult> {
  const eligible = getEligibleDeferredWork(db, now).filter(
    (j) => j.kind === 'healthkit_write' || j.kind === 'passport_geocode',
  );
  let succeeded = 0;
  let failedOrRetrying = 0;
  for (const job of eligible) {
    const outcome = await processOne(db, job, healthKit, geocode, now);
    if (outcome === 'succeeded') succeeded++;
    else failedOrRetrying++;
  }
  return { processed: eligible.length, succeeded, failedOrRetrying };
}
