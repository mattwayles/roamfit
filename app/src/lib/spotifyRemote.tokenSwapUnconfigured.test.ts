/**
 * The native module is present, but the token-swap server isn't configured for this build. Since
 * Spotify sunset the Implicit Grant flow on 2025-11-27 (see `spotifyRemote.ts`'s `connectSpotify`
 * header), retrying it produces nothing but a confusing native error — so this build should fail
 * fast with a sentence instead of ever calling `Auth.authenticate()`.
 *
 * Separate file from `spotifyRemote.test.ts` for the same reason `spotifyRemote.unavailable.test.ts`
 * is: `tokenSwapURL`/`tokenRefreshURL` are read from `process.env` once, at module import, so the
 * "configured" and "unconfigured" cases can't share a module registry.
 */
const mockModule = {
  Auth: {
    isAvailable: jest.fn(() => true),
    cancelPending: jest.fn(async () => undefined),
    authenticate: jest.fn(async () => ({ accessToken: 'token-abc' })),
  },
  AppRemote: {
    connect: jest.fn(async () => undefined),
    authorizeAndPlay: jest.fn(async () => undefined),
    isConnected: jest.fn(() => false),
    addListener: jest.fn(() => ({ remove: () => undefined })),
  },
  Player: {
    resume: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    skipNext: jest.fn(async () => undefined),
    skipPrevious: jest.fn(async () => undefined),
    addListener: jest.fn(() => ({ remove: () => undefined })),
  },
};

jest.mock('@wwdrew/expo-spotify-sdk', () => mockModule);

// Deliberately left unset — this is the whole case under test. Restored afterward since
// `process.env` is a single object shared by every test file in a Jest worker.
const previousTokenSwapURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL;
const previousTokenRefreshURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL;
delete process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL;
delete process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL;
afterAll(() => {
  process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL = previousTokenSwapURL;
  process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL = previousTokenRefreshURL;
});

import { connectSpotify } from './spotifyRemote';

it('fails fast with a sentence instead of retrying the Implicit Grant flow Spotify killed', async () => {
  await expect(connectSpotify()).resolves.toBe(
    'Spotify sign-in isn’t finished setting up on this build (no token swap server).',
  );
  expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
});
