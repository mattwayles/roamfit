/**
 * Lazily-constructed singleton Anthropic client. Lazy so that importing this module (e.g. for
 * `models.ts`'s constants, or by a test that never actually calls a job) never requires
 * `ANTHROPIC_API_KEY` to be set — the key is only demanded the moment a real network call would
 * happen. Every job function in `src/jobs/` takes its Anthropic client as a parameter rather than
 * calling this directly, so tests inject a fake and never construct a real SDK client at all.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getApiKeyOrThrow } from './config';

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: getApiKeyOrThrow() });
  }
  return cached;
}
