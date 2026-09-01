/**
 * §7.3 Cloud Function entry points. **Not deployed or verified against a real Firebase project
 * in this track** — no `firebase.json`/project config exists yet in this repo (that is 6d's
 * scope, Firestore sync), and there is no emulator run backing this file. Deploy verification is
 * an explicit gap; see `docs/handoff/STATUS-6c-llm-proxy.md`.
 *
 * All three callables are thin: read the request, call the matching pure job function from
 * `src/jobs/`, return its result. All product logic (validation, repair, fallback, prompt
 * shape) lives in the job functions and is unit-tested without any Firebase runtime at all.
 */
import { defineSecret } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { getAnthropicClient } from './anthropicClient';
import { createAnthropicParseFn } from './client';
import { runCoachVoiceJob, type CoachVoiceJobInput } from './jobs/coachVoice';
import { runDistillJob, type DistillJobInput } from './jobs/distill';
import { runIntakeJob, type IntakeJobInput } from './jobs/intake';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

export const llmIntake = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const input = request.data as IntakeJobInput;
  const parse = createAnthropicParseFn(getAnthropicClient());
  return runIntakeJob(parse, input);
});

export const llmCoachVoice = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const input = request.data as CoachVoiceJobInput;
  const parse = createAnthropicParseFn(getAnthropicClient());
  return runCoachVoiceJob(parse, input);
});

export const llmDistillFeedback = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const input = request.data as DistillJobInput;
  const parse = createAnthropicParseFn(getAnthropicClient());
  return runDistillJob(parse, input);
});
