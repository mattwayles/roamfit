/**
 * §7.3 — the testable half of each Cloud Function callable, deliberately kept OUT of `index.ts`.
 *
 * `index.ts` imports `firebase-functions/v2/https` and `firebase-functions/params`, which pull in
 * `firebase-admin` -> `jwks-rsa` -> `jose` (ESM). Jest cannot require that chain as CommonJS, so a
 * test importing `./index` fails to even load the suite — and `firebase-functions/logger` drags the
 * same chain in under Jest's resolver. So this module imports NO firebase package at all: the log
 * sink is an injected boundary whose production default lazily requires the real logger only when
 * actually called (i.e. never in a test). Same discipline as `ParseFn`, `FirestoreSyncClient`, and
 * `YouTubeClient` — the boundary is injected, the logic stays pure and testable.
 */

/** The one thing these handlers need from the Firebase runtime. */
export type LogSink = (event: string, fields: Record<string, unknown>) => void;

/** Production default — resolved lazily so merely importing this module never loads
 *  `firebase-functions` (and therefore never loads `firebase-admin`/`jose`). */
export const firebaseLogSink: LogSink = (event, fields) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logger } = require('firebase-functions') as {
    logger: { info: (e: string, f: Record<string, unknown>) => void };
  };
  logger.info(event, fields);
};
import type { ParseFn } from './client';
import { runCoachVoiceJob, type CoachVoiceJobInput, type CoachVoiceJobResult } from './jobs/coachVoice';
import { runDistillJob, type DistillJobInput, type DistillJobResult } from './jobs/distill';
import { runIntakeJob, type IntakeJobInput, type IntakeJobResult } from './jobs/intake';
import { COACH_VOICE_MODEL, DISTILLATION_MODEL, INTAKE_MODEL } from './models';

/**
 * One structured `llm_proxy_call` log line per job invocation. Deliberately logs
 * `cacheReadInputTokens` as its own top-level field (not buried in a string) so an operator can
 * filter/chart it directly in Cloud Logging (`jsonPayload.cacheReadInputTokens`) — see the
 * operator runbook for the exact query and what a healthy vs. persistently-zero value means.
 * Never logs `input`/freeform user text — this line reports call metadata only.
 */
function logLlmProxyCall(log: LogSink, fields: {
  job: 'intake' | 'coachVoice' | 'distillFeedback';
  model: string;
  cacheReadInputTokens: number;
  repaired: boolean;
  usedFallback: boolean;
}): void {
  log('llm_proxy_call', fields);
}

/**
 * The testable half of each callable: run the job, log the structured `llm_proxy_call` line,
 * return the job's result. Takes an injected `ParseFn` for the same reason every `src/jobs/*`
 * function does — so this logic is unit-tested with zero network access and no real API key,
 * same as `functions/src/jobs/*.test.ts`. The `onCall` wrappers below are the only parts that
 * touch a real Anthropic client, and they stay untestable-without-a-key by construction (that is
 * the entire point of `getApiKeyOrThrow` — see `config.ts`).
 */
export async function handleIntake(
  parse: ParseFn,
  input: IntakeJobInput,
  log: LogSink = firebaseLogSink,
): Promise<IntakeJobResult> {
  const result = await runIntakeJob(parse, input);
  logLlmProxyCall(log, {
    job: 'intake',
    model: INTAKE_MODEL,
    cacheReadInputTokens: result.cacheReadInputTokens,
    repaired: result.repaired,
    usedFallback: result.params === null,
  });
  return result;
}

export async function handleCoachVoice(
  parse: ParseFn,
  input: CoachVoiceJobInput,
  log: LogSink = firebaseLogSink,
): Promise<CoachVoiceJobResult> {
  const result = await runCoachVoiceJob(parse, input);
  logLlmProxyCall(log, {
    job: 'coachVoice',
    model: COACH_VOICE_MODEL,
    cacheReadInputTokens: result.cacheReadInputTokens,
    repaired: result.repaired,
    usedFallback: result.usedFallback,
  });
  return result;
}

export async function handleDistillFeedback(
  parse: ParseFn,
  input: DistillJobInput,
  log: LogSink = firebaseLogSink,
): Promise<DistillJobResult> {
  const result = await runDistillJob(parse, input);
  logLlmProxyCall(log, {
    job: 'distillFeedback',
    model: DISTILLATION_MODEL,
    cacheReadInputTokens: result.cacheReadInputTokens,
    repaired: result.repaired,
    usedFallback: result.usedFallback,
  });
  return result;
}
