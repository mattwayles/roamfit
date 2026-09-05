/**
 * The no-native-module case, which is not a hypothetical: it is Jest, and it is every build made
 * before `expo prebuild` ran with `SPOTIFY_CLIENT_ID` set. This file deliberately does **not**
 * mock `@wwdrew/expo-spotify-sdk`, so it exercises the real lazy `require` failing exactly the way
 * it fails on a device without the native module — which is the whole reason the guard in
 * `spotifyRemote.ts` exists (same hazard `workoutAudio.ts` documents for `expo-audio`).
 *
 * Separate file rather than a `describe` block because `jest.mock` is hoisted per module registry:
 * the sibling `spotifyRemote.test.ts` mocks the package for the entire file, so the unmocked case
 * has nowhere else to live.
 *
 * What this proves: nothing throws, and every path reports unavailability rather than pretending
 * to work. What it cannot prove: that any of it controls Spotify. That needs a device.
 */
import { renderHook, act } from '@testing-library/react-native';
import {
  connectSpotify,
  isSpotifySupported,
  spotifyPause,
  spotifyResume,
  spotifySkipNext,
  spotifySkipPrevious,
  useSpotifyPlayer,
  __resetSpotifyModuleCacheForTests,
} from './spotifyRemote';

beforeEach(() => __resetSpotifyModuleCacheForTests());

describe('spotifyRemote with no native module', () => {
  it('reports the module as unsupported instead of throwing on import', () => {
    expect(isSpotifySupported()).toBe(false);
  });

  it('connect resolves with a reason rather than rejecting', async () => {
    await expect(connectSpotify()).resolves.toBe('Spotify isn’t set up in this build.');
  });

  it('every transport call is safe and says why it did nothing', async () => {
    await expect(spotifyResume()).resolves.toBe('Spotify isn’t set up in this build.');
    await expect(spotifyPause()).resolves.toBe('Spotify isn’t set up in this build.');
    await expect(spotifySkipNext()).resolves.toBe('Spotify isn’t set up in this build.');
    await expect(spotifySkipPrevious()).resolves.toBe('Spotify isn’t set up in this build.');
  });

  it('the hook renders, subscribes to nothing, and reports unavailable', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());

    expect(result.current.available).toBe(false);
    expect(result.current.connectionState).toBe('unavailable');
    expect(result.current.track).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('pressing a control on an unavailable build surfaces the reason and never throws', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());

    await act(async () => result.current.skipNext());

    expect(result.current.lastError).toBe('Spotify isn’t set up in this build.');
  });
});
