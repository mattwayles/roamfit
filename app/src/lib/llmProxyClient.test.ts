/**
 * Same shape as `firestoreSyncClient.test.ts` — no Firebase project is configured in this (or any
 * CI) environment (`EXPO_PUBLIC_FIREBASE_*` env vars are unset, the correct default: no credential
 * of any kind is committed to this repo). This locks in that `createLlmProxyCaller` degrades to
 * `null` rather than throwing or half-initializing against an empty config, which is exactly the
 * signal `opportunisticSync.ts` uses to skip `processLlmQueue` entirely (issue #34).
 */
import { createLlmProxyCaller } from './llmProxyClient';

describe('createLlmProxyCaller with no Firebase project configured', () => {
  it('returns null rather than throwing or half-initializing', () => {
    expect(createLlmProxyCaller()).toBeNull();
  });
});
