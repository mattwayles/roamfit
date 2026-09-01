/**
 * §7.3 Cloud Function entry points. **Not deployed or verified against a real Firebase project
 * from this environment** — `firebase.json`/`.firebaserc`/`firestore.rules` exist at the repo
 * root and `functions/` now has a real build step (issue #41), but actually deploying needs real
 * credentials this environment doesn't have, and there is still no emulator run backing this
 * file. See `docs/handoff/STATUS-6f-deploy.md` and its operator runbook for the deploy steps and
 * the exact `cache_read_input_tokens` verification procedure (issue #36 — structurally proven,
 * not yet observed against a live call).
 *
 * All three callables are thin: read the request, call the matching pure job function from
 * `src/jobs/`, log one structured line (issue #36 — this is what makes
 * `cache_read_input_tokens` observable in Cloud Logging after a real deploy, instead of the
 * value only ever existing inside the returned object), return the job's result. All product
 * logic (validation, repair, fallback, prompt shape) lives in the job functions and is
 * unit-tested without any Firebase runtime at all.
 */
import { defineSecret } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { getAnthropicClient } from './anthropicClient';
import { createAnthropicParseFn } from './client';
import type { CoachVoiceJobInput } from './jobs/coachVoice';
import type { DistillJobInput } from './jobs/distill';
import type { IntakeJobInput } from './jobs/intake';
import { handleCoachVoice, handleDistillFeedback, handleIntake } from './handlers';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

export { handleIntake, handleCoachVoice, handleDistillFeedback } from './handlers';

export const llmIntake = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const parse = createAnthropicParseFn(getAnthropicClient());
  return handleIntake(parse, request.data as IntakeJobInput);
});

export const llmCoachVoice = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const parse = createAnthropicParseFn(getAnthropicClient());
  return handleCoachVoice(parse, request.data as CoachVoiceJobInput);
});

export const llmDistillFeedback = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const parse = createAnthropicParseFn(getAnthropicClient());
  return handleDistillFeedback(parse, request.data as DistillJobInput);
});
