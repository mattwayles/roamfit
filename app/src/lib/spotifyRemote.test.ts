/**
 * The native module *present* case. Its sibling `spotifyRemote.unavailable.test.ts` covers the
 * unmocked path (see that file's header for why the split is two files and not two `describe`s).
 *
 * The mock stands in for `@wwdrew/expo-spotify-sdk`, which cannot load under Jest — so what this
 * suite proves is that `spotifyRemote.ts` calls the right method at the right moment, maps native
 * error codes to sentences a user can act on, and keeps the hook's state honest against the
 * listener stream. It proves **nothing** about Spotify itself: no real IPC, no real auth bounce,
 * no real track ever skips here. `docs/handoff/STATUS-15-spotify-control.md` lists what is left
 * device-only.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

/** Matches the library's error shape closely enough for `describeError`, which narrows on `code`. */
class FakeSpotifyError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type Listener = (payload: unknown) => void;

const listeners: Record<string, Listener[]> = {};

function emit(event: string, payload: unknown): void {
  for (const listener of listeners[event] ?? []) listener(payload);
}

function addListener(event: string, listener: Listener) {
  (listeners[event] ??= []).push(listener);
  return {
    remove: () => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener);
    },
  };
}

const mockModule = {
  Auth: {
    isAvailable: jest.fn(() => true),
    cancelPending: jest.fn(async () => undefined),
    authenticate: jest.fn(async () => ({ accessToken: 'token-abc' })),
  },
  AppRemote: {
    connect: jest.fn(async () => undefined),
    authorizeAndPlay: jest.fn(async () => undefined),
    // Nothing in `spotifyRemote.ts` may call this — it is here so the "unmount leaves the
    // connection alone" case can assert that, rather than assert against its own absence.
    disconnect: jest.fn(async () => undefined),
    isConnected: jest.fn(() => false),
    addListener: jest.fn(addListener),
  },
  Player: {
    resume: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    skipNext: jest.fn(async () => undefined),
    skipPrevious: jest.fn(async () => undefined),
    addListener: jest.fn(addListener),
  },
};

jest.mock('@wwdrew/expo-spotify-sdk', () => mockModule);

// `connectSpotify()` reads these per call to build the Authorization Code config it now requires
// (Implicit Grant is dead — see that file's header). Set here so this suite exercises the
// configured build; `spotifyRemote.tokenSwapUnconfigured.test.ts` covers the sibling case where
// they're unset. `process.env` is a single object shared by every test file in a Jest worker, so
// this restores it afterward rather than leaking into whichever suite runs next.
const previousTokenSwapURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL;
const previousTokenRefreshURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL;
process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL =
  'https://us-central1-roamfit.cloudfunctions.net/spotifyTokenSwap';
process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL =
  'https://us-central1-roamfit.cloudfunctions.net/spotifyTokenRefresh';
afterAll(() => {
  process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL = previousTokenSwapURL;
  process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL = previousTokenRefreshURL;
});

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

/** One `playerStateChange` payload, shaped like the library's `PlayerState`. */
function playerState(over: { name?: string; artist?: string; paused?: boolean } = {}) {
  return {
    track: {
      name: over.name ?? 'Bad Habit',
      artist: { name: over.artist ?? 'Steve Lacy' },
    },
    isPaused: over.paused ?? false,
    playbackRestrictions: { canSkipNext: true, canSkipPrevious: true },
  };
}

beforeEach(() => {
  __resetSpotifyModuleCacheForTests();
  for (const key of Object.keys(listeners)) delete listeners[key];
  jest.clearAllMocks();
  mockModule.Auth.isAvailable.mockReturnValue(true);
  mockModule.Auth.authenticate.mockResolvedValue({ accessToken: 'token-abc' });
  mockModule.AppRemote.isConnected.mockReturnValue(false);
  mockModule.AppRemote.connect.mockResolvedValue(undefined);
});

describe('connectSpotify', () => {
  it('authenticates with only the scopes App Remote actually needs, then attaches', async () => {
    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.Auth.authenticate).toHaveBeenCalledWith({
      scopes: ['app-remote-control', 'user-read-playback-state'],
      tokenSwapURL: 'https://us-central1-roamfit.cloudfunctions.net/spotifyTokenSwap',
      tokenRefreshURL: 'https://us-central1-roamfit.cloudfunctions.net/spotifyTokenRefresh',
    });
    expect(mockModule.AppRemote.connect).toHaveBeenCalledWith('token-abc');
    expect(mockModule.AppRemote.authorizeAndPlay).not.toHaveBeenCalled();
  });

  it('clears a leaked in-flight authorization first, so a retry is really a retry', async () => {
    await connectSpotify();
    expect(mockModule.Auth.cancelPending).toHaveBeenCalled();
  });

  it('wakes a suspended Spotify when connect fails, which is the ordinary case', async () => {
    // iOS suspends backgrounded apps, so `connect()` failing is the common path — phone in a
    // pocket, Spotify not touched today — not an exceptional one.
    mockModule.AppRemote.connect.mockRejectedValueOnce(new FakeSpotifyError('CONNECTION_FAILED'));

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.AppRemote.authorizeAndPlay).toHaveBeenCalledWith('token-abc');
  });

  it('does not wake Spotify for a failure that waking cannot fix', async () => {
    mockModule.AppRemote.connect.mockRejectedValueOnce(new FakeSpotifyError('PREMIUM_REQUIRED'));

    await expect(connectSpotify()).resolves.toBe('Spotify Premium is needed to control playback.');
    expect(mockModule.AppRemote.authorizeAndPlay).not.toHaveBeenCalled();
  });

  it('says so plainly when Spotify is not installed, without attempting auth', async () => {
    mockModule.Auth.isAvailable.mockReturnValue(false);

    await expect(connectSpotify()).resolves.toBe('Spotify isn’t installed on this phone.');
    expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
  });

  it('treats a cancelled sign-in as a fact, not a failure to escalate', async () => {
    mockModule.Auth.authenticate.mockRejectedValueOnce(new FakeSpotifyError('USER_CANCELLED'));

    await expect(connectSpotify()).resolves.toBe('Not connected.');
  });

  it('falls back to a plain sentence for a code it has never seen', async () => {
    mockModule.Auth.authenticate.mockRejectedValueOnce(new FakeSpotifyError('SOME_NEW_CODE'));

    await expect(connectSpotify()).resolves.toBe('Spotify didn’t respond.');
  });
});

describe('transport calls', () => {
  it('each one reaches its own Player method', async () => {
    await expect(spotifyResume()).resolves.toBeNull();
    await expect(spotifyPause()).resolves.toBeNull();
    await expect(spotifySkipNext()).resolves.toBeNull();
    await expect(spotifySkipPrevious()).resolves.toBeNull();

    expect(mockModule.Player.resume).toHaveBeenCalled();
    expect(mockModule.Player.pause).toHaveBeenCalled();
    expect(mockModule.Player.skipNext).toHaveBeenCalled();
    expect(mockModule.Player.skipPrevious).toHaveBeenCalled();
  });

  it('reports a rejection instead of letting it escape into a render', async () => {
    mockModule.Player.skipNext.mockRejectedValueOnce(new FakeSpotifyError('PREMIUM_REQUIRED'));

    await expect(spotifySkipNext()).resolves.toBe('Spotify Premium is needed to control playback.');
  });
});

describe('useSpotifyPlayer', () => {
  it('reports the module as available and starts disconnected', async () => {
    expect(isSpotifySupported()).toBe(true);

    const { result } = await renderHook(() => useSpotifyPlayer());

    expect(result.current.available).toBe(true);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('seeds from a connection an earlier workout already established', async () => {
    // The connection outlives this screen, so a remount must not report "disconnected" and offer
    // to connect something that is already connected.
    mockModule.AppRemote.isConnected.mockReturnValue(true);

    const { result } = await renderHook(() => useSpotifyPlayer());

    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
  });

  it('tracks what Spotify reports playing', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());

    await act(async () => emit('playerStateChange', playerState()));

    expect(result.current.track).toEqual({ name: 'Bad Habit', artist: 'Steve Lacy' });
    expect(result.current.isPlaying).toBe(true);
  });

  it('gates skip buttons on Spotify’s own restrictions', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());

    await act(async () =>
      emit('playerStateChange', {
        ...playerState(),
        playbackRestrictions: { canSkipNext: false, canSkipPrevious: true },
      }),
    );

    expect(result.current.canSkipNext).toBe(false);
    expect(result.current.canSkipPrevious).toBe(true);
  });

  it('drops the now-playing line when the connection goes, rather than leaving a lie on screen', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => emit('playerStateChange', playerState()));
    expect(result.current.track).not.toBeNull();

    await act(async () => emit('connectionStateChange', { state: 'disconnected' }));

    expect(result.current.track).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('pauses when playing and resumes when paused', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => emit('playerStateChange', playerState({ paused: false })));

    await act(async () => result.current.togglePlay());
    expect(mockModule.Player.pause).toHaveBeenCalled();

    await act(async () => emit('playerStateChange', playerState({ paused: true })));
    await act(async () => result.current.togglePlay());
    expect(mockModule.Player.resume).toHaveBeenCalled();
  });

  it('flips the play state immediately rather than waiting on a cross-process round trip', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => emit('playerStateChange', playerState({ paused: false })));

    await act(async () => result.current.togglePlay());

    // Nothing emitted a new player state; the optimistic flip is what is being asserted. The
    // listener remains the source of truth and would correct this within a frame or two.
    expect(result.current.isPlaying).toBe(false);
  });

  it('surfaces a connection error the Spotify app pushes at us unprompted', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());

    await act(async () => emit('connectionError', { code: 'CONNECTION_FAILED', message: 'gone' }));

    expect(result.current.lastError).toBe('Couldn’t reach the Spotify app.');
  });

  it('clears a stale error so it cannot sit under a control that now works', async () => {
    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => emit('connectionError', { code: 'CONNECTION_FAILED', message: 'gone' }));

    await act(async () => result.current.clearError());

    expect(result.current.lastError).toBeNull();
  });

  it('shows connecting while the auth bounce is in flight', async () => {
    let release: () => void = () => {};
    mockModule.Auth.authenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ accessToken: 'token-abc' });
        }),
    );

    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => result.current.connect());

    expect(result.current.connectionState).toBe('connecting');

    await act(async () => {
      release();
    });
  });

  it('drops back to disconnected when the auth bounce fails, instead of sticking on "connecting" forever', async () => {
    // The regression this guards: a real device bounces to Spotify and back with the connection
    // never established (auth cancelled, or Spotify never reachable). Nothing fires
    // `connectionStateChange` in that case, so `connect()` itself must be what recovers.
    mockModule.Auth.authenticate.mockRejectedValueOnce(new FakeSpotifyError('USER_CANCELLED'));

    const { result } = await renderHook(() => useSpotifyPlayer());
    await act(async () => result.current.connect());

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.lastError).toBe('Not connected.');
  });

  it('unsubscribes every listener on unmount but leaves the connection alone', async () => {
    const { unmount } = await renderHook(() => useSpotifyPlayer());
    expect(listeners.playerStateChange).toHaveLength(1);

    await unmount();

    expect(listeners.playerStateChange ?? []).toHaveLength(0);
    expect(listeners.connectionStateChange ?? []).toHaveLength(0);
    // Finishing a workout must not stop the music — the connection belongs to the app, not to the
    // screen that happened to open it.
    expect(mockModule.AppRemote.disconnect).not.toHaveBeenCalled();
  });
});
