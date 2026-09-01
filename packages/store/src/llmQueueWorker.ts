/**
 * §11.3 LLM queue worker — drains the `llm_coach_voice` / `llm_distillation` rows Wave 5 and
 * `sessions.ts`/`completion.ts` already write durably to `deferred_work`, with exponential
 * backoff (`repositories/queues.ts`). This module never calls the network itself: it takes an
 * injected `LlmProxyCaller` so `packages/store` stays free of any HTTP/fetch dependency and the
 * actual Cloud Function call is `app/`'s to make (the proxy itself lives in the separate
 * `functions/` workspace, deployed independently — `packages/store` must not depend on it).
 *
 * Every effect this worker applies (`applyCoachVoiceResult`, `logSignalEvent`) only ever
 * receives data the Cloud Function has *already* run through `@roamfit/engine`'s validators —
 * this worker trusts its `caller`'s result the same way `functions/src/jobs/*` trusts a
 * validated model response, which is to say: it is the caller's job to have validated, this
 * worker's job is only to apply-or-retry.
 *
 * A caller failure (thrown error, e.g. no connectivity, or a timeout) is the *only* thing that
 * triggers backoff — the Cloud Function itself never "fails" a job just because the model was
 * wrong (it already falls back deterministically and returns a normal result, per §7.3).
 */
import type { Db } from './db';
import { getSession, applyCoachVoiceResult } from './repositories/sessions';
import { logSignalEvent } from './repositories/signals';
import {
  getEligibleDeferredWork,
  markDeferredWorkDone,
  recordDeferredWorkFailure,
  type DeferredWorkRecord,
} from './repositories/queues';

export interface CoachVoiceCallResult {
  explanation: string;
  usedFallback: boolean;
}

export interface DistillFeedbackCallResult {
  suspectedLimitationTag: string | null;
  bandTooLightExerciseIds: string[];
  aversionExerciseIds: string[];
}

/** The seam `app/` implements against the deployed Cloud Function (or a local emulator). Every
 *  method here corresponds 1:1 to one of `functions/src/jobs/*`'s exported job functions — this
 *  interface exists so `packages/store` never imports `@roamfit/functions` or any HTTP client. */
export interface LlmProxyCaller {
  coachVoice(input: {
    deterministicExplanation: string;
    sessionExerciseIds: string[];
  }): Promise<CoachVoiceCallResult>;
  distillFeedback(input: {
    retrospectiveText: string;
    sessionExerciseIds: string[];
  }): Promise<DistillFeedbackCallResult>;
}

export interface ProcessLlmQueueResult {
  processed: number;
  succeeded: number;
  failedOrRetrying: number;
}

async function processOne(
  db: Db,
  job: DeferredWorkRecord,
  caller: LlmProxyCaller,
  now: string,
): Promise<'succeeded' | 'failed'> {
  const session = getSession(db, job.sessionId);
  if (!session) {
    // The session was discarded before this job ran — nothing left to enrich. Terminal, not a
    // failure: retrying forever would never succeed.
    markDeferredWorkDone(db, job.id, now);
    return 'succeeded';
  }
  const sessionExerciseIds = session.entries.map((e) => e.exerciseId);

  try {
    if (job.kind === 'llm_coach_voice') {
      const result = await caller.coachVoice({
        deterministicExplanation: session.explanation,
        sessionExerciseIds,
      });
      applyCoachVoiceResult(db, job.sessionId, result.explanation, now);
      markDeferredWorkDone(db, job.id, now);
      return 'succeeded';
    }

    if (job.kind === 'llm_distillation') {
      const retrospectiveText =
        (job.payload as { retrospective?: string | null }).retrospective ?? '';
      const result = await caller.distillFeedback({ retrospectiveText, sessionExerciseIds });
      logSignalEvent(db, {
        sessionId: job.sessionId,
        type: 'llm_distillation_result',
        payload: { ...result },
        utcInstant: now,
        localDate: session.localDate,
      });
      markDeferredWorkDone(db, job.id, now);
      return 'succeeded';
    }

    // Any other kind (healthkit_write, passport_geocode) is out of scope for this worker — 6d's.
    return 'succeeded';
  } catch {
    // Network failure, timeout, or the proxy being entirely unreachable — the only case this
    // worker treats as retryable. Never throws further: queue processing must never crash the
    // caller (§11.1 — offline is not a degradation mode, and a queue drain runs opportunistically
    // whenever connectivity appears).
    recordDeferredWorkFailure(db, job.id, now);
    return 'failed';
  }
}

/** Drains every eligible `llm_coach_voice`/`llm_distillation` job. Callers (app) decide when to
 *  invoke this — typically on a connectivity-restored signal or app foreground — never on the
 *  critical path of generate/approve/run/complete/log (invariant 1). */
export async function processLlmQueue(
  db: Db,
  now: string,
  caller: LlmProxyCaller,
): Promise<ProcessLlmQueueResult> {
  const eligible = getEligibleDeferredWork(db, now).filter(
    (j) => j.kind === 'llm_coach_voice' || j.kind === 'llm_distillation',
  );
  let succeeded = 0;
  let failedOrRetrying = 0;
  for (const job of eligible) {
    const outcome = await processOne(db, job, caller, now);
    if (outcome === 'succeeded') succeeded++;
    else failedOrRetrying++;
  }
  return { processed: eligible.length, succeeded, failedOrRetrying };
}
