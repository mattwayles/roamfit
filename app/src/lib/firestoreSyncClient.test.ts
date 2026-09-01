/**
 * No Firebase project is configured in this (or any CI) environment — `EXPO_PUBLIC_FIREBASE_*`
 * env vars are unset, which is the correct default (no credential of any kind is committed to
 * this repo). This test locks in that `createFirestoreSyncClient` degrades to `null` rather than
 * throwing or half-initializing against an empty config.
 */
import { createFirestoreSyncClient } from './firestoreSyncClient';

describe('createFirestoreSyncClient with no Firebase project configured', () => {
  it('returns null rather than throwing or half-initializing', () => {
    expect(createFirestoreSyncClient()).toBeNull();
  });
});
