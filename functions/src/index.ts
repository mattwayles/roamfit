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
import { defineSecret, defineString } from 'firebase-functions/params';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getAnthropicClient } from './anthropicClient';
import { createAnthropicParseFn } from './client';
import type { CoachVoiceJobInput } from './jobs/coachVoice';
import type { DistillJobInput } from './jobs/distill';
import type { IntakeJobInput } from './jobs/intake';
import { handleCoachVoice, handleDistillFeedback, handleIntake } from './handlers';
import { handleSpotifyTokenRefresh, handleSpotifyTokenSwap } from './spotifyTokenSwap';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// Not secret — the client ID is already in the app bundle's Info.plist, and the redirect URI is
// a fixed public value Spotify's dashboard has on file. Only the client secret needs to stay off
// the client and out of the repo, which is why it alone is a `defineSecret`, set with
// `firebase functions:secrets:set SPOTIFY_CLIENT_SECRET`. See `docs/SPOTIFY-SETUP.md`.
const spotifyClientId = defineString('SPOTIFY_CLIENT_ID');
const spotifyRedirectUri = defineString('SPOTIFY_REDIRECT_URI', {
  default: 'roamfit://spotify-auth',
});
const spotifyClientSecret = defineSecret('SPOTIFY_CLIENT_SECRET');

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

/**
 * `tokenSwapURL` / `tokenRefreshURL` for `@wwdrew/expo-spotify-sdk`'s Authorization Code flow —
 * see `spotifyTokenSwap.ts`'s header for why this exists at all. Plain `onRequest`, not `onCall`:
 * the native iOS SDK POSTs a form-urlencoded body directly (it has no notion of Firebase's
 * callable wire format), and Cloud Functions parses that into `req.body` the same way it parses
 * JSON. Errors are relayed with the same status/body Spotify returned rather than thrown, so the
 * SDK's own `invalid_grant` detection (see `SpotifyTokenRefreshClient.swift`) still works.
 */
export const spotifyTokenSwap = onRequest({ secrets: [spotifyClientSecret] }, async (req, res) => {
  const result = await handleSpotifyTokenSwap(
    fetch,
    spotifyClientId.value(),
    spotifyClientSecret.value(),
    spotifyRedirectUri.value(),
    (req.body ?? {}) as Record<string, string>,
  );
  res.status(result.status).type(result.contentType).send(result.body);
});

export const spotifyTokenRefresh = onRequest(
  { secrets: [spotifyClientSecret] },
  async (req, res) => {
    const result = await handleSpotifyTokenRefresh(
      fetch,
      spotifyClientId.value(),
      spotifyClientSecret.value(),
      (req.body ?? {}) as Record<string, string>,
    );
    res.status(result.status).type(result.contentType).send(result.body);
  },
);
