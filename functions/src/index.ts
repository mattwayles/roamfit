/**
 * §7.3 Cloud Function entry points. **Not deployed or verified against a real Firebase project
 * from this environment** — `firebase.json`/`.firebaserc`/`firestore.rules` now exist at the repo
 * root (added by track 6d, closing issue #35's "no firebase.json" half), but actually deploying
 * needs real credentials this environment doesn't have, and there is still no emulator run
 * backing this file. See `docs/handoff/STATUS-6d-sync-health.md` for the operator steps to
 * deploy and the remaining unverified gap (a real end-to-end call, `cache_read_input_tokens`).
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
