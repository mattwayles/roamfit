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

/**
 * The persisted-session half (`spotifySession.ts`) is auto-mocked (no factory) rather than given
 * one like `@wwdrew/expo-spotify-sdk` below — deliberately, not just for brevity. `spotifyRemote.ts`
 * imports it with a plain top-level `import`, unlike the SDK module (which it only ever
 * `require()`s lazily, inside a function, specifically so a factory closing over an outer `const`
 * can populate it before that `require()` ever runs — see that module's own header). A factory
 * here closing over a same-file `const mockLoadStoredSpotifySession = jest.fn()` would capture it
 * *before* the `const` initializer had run: Babel hoists every `import`-derived `require()`
 * (including the one that pulls in `spotifySession.ts` transitively, via `spotifyRemote.ts`'s own
 * eager import of it) above this file's own top-level statements, so the factory would see
 * `undefined` in place of the mock function. Auto-mocking sidesteps the whole problem: Jest
 * replaces each real export with its own `jest.fn()` in place, no closure involved, so
 * `jest.mocked()` below just gets a typed handle on exactly those. */
jest.mock('./spotifySession');
import {
  loadStoredSpotifySession,
  saveStoredSpotifySession,
  clearStoredSpotifySession,
} from './spotifySession';
const mockLoadStoredSpotifySession = jest.mocked(loadStoredSpotifySession);
const mockSaveStoredSpotifySession = jest.mocked(saveStoredSpotifySession);
const mockClearStoredSpotifySession = jest.mocked(clearStoredSpotifySession);

/** `useSpotifyPlayer`'s foreground-resume effect subscribes to the real `AppState`, which under
 *  Jest has no device to ever report a real transition — this captures the `'change'` handler so
 *  a test can fire one, the same way `emit()` above stands in for the SDK's own listeners.
 *
 * Mocked at this specific submodule path, not the whole `react-native` package (`AppState`'s own
 * export in `react-native/index.js`) — pulling in the real package via `jest.requireActual` to
 * spread over drags in `DevMenu` and other native-only modules that don't exist under Jest and
 * crash the whole suite on import. This is the exact file `react-native`'s own `AppState` getter
 * requires, so `import { AppState } from 'react-native'` resolves to this mock either way. */
let mockAppStateChangeHandler: ((state: string) => void) | null = null;
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((event: string, handler: (state: string) => void) => {
      if (event === 'change') mockAppStateChangeHandler = handler;
      return {
        remove: () => {
          if (mockAppStateChangeHandler === handler) mockAppStateChangeHandler = null;
        },
      };
    }),
  },
}));

/** One resumable stored session — a still-fresh access token, so a test using it exercises the
 *  zero-network path unless it deliberately backdates `expirationDate` itself. */
function storedSession(over: Partial<import('./spotifySession').StoredSpotifySession> = {}) {
  return {
    accessToken: 'stored-access-token',
    refreshToken: 'stored-refresh-token',
    expirationDate: Date.now() + 60 * 60 * 1000,
    scopes: ['app-remote-control', 'user-read-playback-state'],
    ...over,
  };
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
    authenticate: jest.fn(
      async (): Promise<{
        accessToken: string;
        refreshToken?: string | null;
        expirationDate?: number;
        scopes?: string[];
      }> => ({ accessToken: 'token-abc' }),
    ),
    refresh: jest.fn(
      async (): Promise<{
        accessToken: string;
        refreshToken?: string | null;
        expirationDate?: number;
        scopes?: string[];
      }> => ({ accessToken: 'token-abc' }),
    ),
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
    play: jest.fn(async () => undefined),
    addListener: jest.fn(addListener),
  },
  Content: {
    getRecommendedContentItems: jest.fn(async () => []),
    getChildren: jest.fn(async (): Promise<unknown[]> => []),
  },
  SpotifyURI: {
    unsafe: jest.fn((uri: string) => uri),
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
  getContentChildren,
  getFitnessContent,
  isSpotifySupported,
  playSpotifyContent,
  spotifyPause,
  spotifyResume,
  spotifySkipNext,
  spotifySkipPrevious,
  useSpotifyPlayer,
  __resetSpotifyModuleCacheForTests,
} from './spotifyRemote';
import type { SpotifyContentItem } from './spotifyRemote';

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
  mockAppStateChangeHandler = null;
  jest.clearAllMocks();
  mockModule.Auth.isAvailable.mockReturnValue(true);
  mockModule.Auth.authenticate.mockResolvedValue({ accessToken: 'token-abc' });
  mockModule.Auth.refresh.mockResolvedValue({ accessToken: 'token-abc' });
  mockModule.AppRemote.isConnected.mockReturnValue(false);
  mockModule.AppRemote.connect.mockResolvedValue(undefined);
  mockModule.Player.play.mockResolvedValue(undefined);
  mockModule.Content.getRecommendedContentItems.mockResolvedValue([]);
  mockModule.Content.getChildren.mockResolvedValue([]);
  mockModule.SpotifyURI.unsafe.mockImplementation((uri: string) => uri);
  // No stored session by default — every existing test below exercises the "nothing to resume,
  // fall straight through to interactive auth" path exactly as before this file gained one.
  mockLoadStoredSpotifySession.mockResolvedValue(null);
  mockSaveStoredSpotifySession.mockResolvedValue(undefined);
  mockClearStoredSpotifySession.mockResolvedValue(undefined);
});

/** One raw item shaped like the library's own `ContentItem` — what `Content.*` mocks resolve with,
 *  before `spotifyRemote.ts` trims it down to `SpotifyContentItem`. */
function rawContentItem(over: Partial<SpotifyContentItem> = {}) {
  return {
    title: 'Power Hour',
    subtitle: 'Workout Mix',
    contentDescription: null,
    identifier: 'item-1',
    uri: 'spotify:playlist:abc123',
    imageIdentifier: null,
    isAvailableOffline: false,
    isPlayable: true,
    isContainer: false,
    isPinned: false,
    ...over,
  };
}

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

  it('persists a freshly granted session that carries a refresh token', async () => {
    mockModule.Auth.authenticate.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expirationDate: 1_700_000_000_000,
      scopes: ['app-remote-control', 'user-read-playback-state'],
    });

    await connectSpotify();

    expect(mockSaveStoredSpotifySession).toHaveBeenCalledWith({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expirationDate: 1_700_000_000_000,
      scopes: ['app-remote-control', 'user-read-playback-state'],
    });
  });

  it('does not persist a session with no refresh token — nothing there could ever be resumed', async () => {
    mockModule.Auth.authenticate.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: null,
      expirationDate: 1_700_000_000_000,
      scopes: ['app-remote-control'],
    });

    await connectSpotify();

    expect(mockSaveStoredSpotifySession).not.toHaveBeenCalled();
  });
});

describe('connectSpotify — resuming a persisted session', () => {
  it('reuses a still-fresh stored access token directly, with no interactive auth and no refresh call', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.AppRemote.connect).toHaveBeenCalledWith('stored-access-token');
    expect(mockModule.Auth.refresh).not.toHaveBeenCalled();
    expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
  });

  it('silently refreshes an expired stored token, then connects — still no interactive auth', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(
      storedSession({ expirationDate: Date.now() - 1000 }),
    );
    mockModule.Auth.refresh.mockResolvedValue({
      accessToken: 'renewed-access-token',
      refreshToken: 'renewed-refresh-token',
      expirationDate: Date.now() + 60 * 60 * 1000,
      scopes: ['app-remote-control', 'user-read-playback-state'],
    });

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.Auth.refresh).toHaveBeenCalledWith({
      refreshToken: 'stored-refresh-token',
      tokenRefreshURL: 'https://us-central1-roamfit.cloudfunctions.net/spotifyTokenRefresh',
      scopes: ['app-remote-control', 'user-read-playback-state'],
    });
    expect(mockSaveStoredSpotifySession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'renewed-access-token' }),
    );
    expect(mockModule.AppRemote.connect).toHaveBeenCalledWith('renewed-access-token');
    expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
  });

  it('wakes Spotify with the resumed token when it is not running, still without interactive auth', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    mockModule.AppRemote.connect.mockRejectedValueOnce(new FakeSpotifyError('CONNECTION_FAILED'));

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.AppRemote.authorizeAndPlay).toHaveBeenCalledWith('stored-access-token');
    expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
  });

  it('clears a dead refresh token and falls back to interactive auth', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(
      storedSession({ expirationDate: Date.now() - 1000 }),
    );
    mockModule.Auth.refresh.mockRejectedValueOnce(new FakeSpotifyError('REFRESH_TOKEN_EXPIRED'));

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockClearStoredSpotifySession).toHaveBeenCalled();
    expect(mockModule.Auth.authenticate).toHaveBeenCalled();
  });

  it('leaves a merely-unreachable stored session alone and falls back to interactive auth', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(
      storedSession({ expirationDate: Date.now() - 1000 }),
    );
    mockModule.Auth.refresh.mockRejectedValueOnce(new FakeSpotifyError('NETWORK_ERROR'));

    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockClearStoredSpotifySession).not.toHaveBeenCalled();
    expect(mockModule.Auth.authenticate).toHaveBeenCalled();
  });

  it('surfaces Premium-required immediately from a resumed connect, without a pointless interactive retry', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    mockModule.AppRemote.connect.mockRejectedValueOnce(new FakeSpotifyError('PREMIUM_REQUIRED'));

    await expect(connectSpotify()).resolves.toBe('Spotify Premium is needed to control playback.');
    expect(mockModule.Auth.authenticate).not.toHaveBeenCalled();
  });

  it('falls back to interactive auth when there is nothing stored at all', async () => {
    await expect(connectSpotify()).resolves.toBeNull();

    expect(mockModule.Auth.authenticate).toHaveBeenCalled();
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

describe('getFitnessContent', () => {
  const freshSession = {
    accessToken: 'tok',
    refreshToken: 'r',
    expirationDate: Date.now() + 3600_000,
    scopes: [],
  };
  const playlist = (id: string, name: string) => ({
    id,
    uri: `spotify:playlist:${id}`,
    name,
    owner: { display_name: 'Spotify' },
  });
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockLoadStoredSpotifySession.mockResolvedValue(freshSession);
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it('searches playlists with the stored token, keeps fitness-named ones, and dedupes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        playlists: {
          items: [null, playlist('a', 'Power Workout'), playlist('b', 'Chill Evening Vibes')],
        },
      }),
    });

    const result = await getFitnessContent();

    expect(fetchMock.mock.calls[0][0]).toContain('api.spotify.com/v1/search?type=playlist');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(result).toEqual({
      items: [
        {
          title: 'Power Workout',
          subtitle: 'Spotify',
          identifier: 'a',
          uri: 'spotify:playlist:a',
          isPlayable: true,
          // A playlist is a container of tracks — previewable via `getContentChildren` over App
          // Remote, no further network call of ours.
          isContainer: true,
        },
      ],
      error: null,
    });
  });

  /** Small seeded PRNG (mulberry32) so randomised behaviour is reproducible. */
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const queryOf = (url: string) => decodeURIComponent(url.split('&q=')[1]);
  const offsetOf = (url: string) => Number(/offset=(\d+)/.exec(url)![1]);
  /** Every query answers with 10 distinct playlists named after it. */
  const answerPerQuery = () =>
    fetchMock.mockImplementation(async (url: string) => {
      const q = queryOf(url);
      return {
        ok: true,
        json: async () => ({
          playlists: {
            items: Array.from({ length: 10 }, (_, i) => playlist(`${q}#${i}`, `${q} mix ${i}`)),
          },
        }),
      };
    });

  it('builds up to six distinct queries from the chosen vibes, each with a shallow offset', async () => {
    answerPerQuery();
    const { SPOTIFY_VIBES } = jest.requireActual(
      './spotifyVibes',
    ) as typeof import('./spotifyVibes');
    const pool = [
      ...SPOTIFY_VIBES.find((v) => v.id === 'rock')!.terms,
      ...SPOTIFY_VIBES.find((v) => v.id === 'metal')!.terms,
    ];

    await getFitnessContent(['rock', 'metal'], { random: seeded(7) });

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    const queries = urls.map(queryOf);
    expect(queries).toHaveLength(6);
    expect(new Set(queries).size).toBe(6);
    for (const q of queries) expect(pool).toContain(q);
    for (const u of urls) {
      expect([0, 10, 20, 30]).toContain(offsetOf(u));
      expect(u).toContain('limit=10');
    }
  });

  it('falls back to the generic terms when no vibe is chosen', async () => {
    answerPerQuery();

    await getFitnessContent([], { random: seeded(1) });

    const queries = fetchMock.mock.calls.map((c) => queryOf(c[0] as string)).sort();
    expect(queries).toEqual(['cardio', 'gym', 'hiit', 'running', 'strength training', 'workout']);
  });

  it('is deterministic for a given seed', async () => {
    answerPerQuery();
    const first = await getFitnessContent(['rock', 'pop'], { random: seeded(42) });
    const firstUrls = fetchMock.mock.calls.map((c) => c[0]);
    fetchMock.mockClear();
    const second = await getFitnessContent(['rock', 'pop'], { random: seeded(42) });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(firstUrls);
    expect(second).toEqual(first);
  });

  it('skips excluded playlist ids', async () => {
    answerPerQuery();
    const all = await getFitnessContent(['rock'], { random: seeded(3) });
    const excluded = new Set(all.items.slice(0, 5).map((i) => i.identifier));

    const result = await getFitnessContent(['rock'], { random: seeded(3), excludeIds: excluded });

    expect(result.items.length).toBe(all.items.length - 5);
    for (const i of result.items) expect(excluded.has(i.identifier)).toBe(false);
  });

  it('shuffles the final list rather than returning round-robin order', async () => {
    answerPerQuery();
    // Round-robin order is what a no-op shuffle would return: a random() of ~1 keeps every element
    // in place in Fisher–Yates (j === i), and also picks the same query/offset sampling each time.
    const keepOrder = await getFitnessContent(['rock'], { random: () => 0.999999 });
    let differs = false;
    for (let seed = 1; seed <= 10 && !differs; seed++) {
      const r = await getFitnessContent(['rock'], { random: seeded(seed) });
      const a = r.items.map((i) => i.identifier);
      const b = keepOrder.items.map((i) => i.identifier);
      differs = a.join() !== b.join();
    }
    expect(differs).toBe(true);
  });

  it('keeps results from queries that succeeded when others fail', async () => {
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (n++ % 2 === 0) return { ok: false, status: 500 };
      const q = queryOf(url);
      return { ok: true, json: async () => ({ playlists: { items: [playlist(q, `${q} mix`)] } }) };
    });

    const result = await getFitnessContent(['rock'], { random: seeded(5) });

    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(3);
  });

  it('asks to reconnect when there is no stored session', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(null);

    const result = await getFitnessContent();

    expect(result).toEqual({ items: [], error: 'Reconnect Spotify to browse workout playlists.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an error only when every query failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    const result = await getFitnessContent();

    expect(result).toEqual({ items: [], error: 'Couldn’t reach Spotify to find playlists.' });
  });
});

describe('getContentChildren', () => {
  it("drills into an item, passing the item's own uri through to the SDK", async () => {
    mockModule.Content.getChildren.mockResolvedValue([rawContentItem({ identifier: 'child' })]);
    const parent: SpotifyContentItem = {
      title: 'Cardio',
      subtitle: null,
      identifier: 'folder',
      uri: 'spotify:playlist:folder-uri',
      isPlayable: false,
      isContainer: true,
    };

    const result = await getContentChildren(parent);

    expect(mockModule.Content.getChildren).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'spotify:playlist:folder-uri' }),
    );
    expect(result.items).toEqual([expect.objectContaining({ identifier: 'child' })]);
    expect(result.error).toBeNull();
  });

  it('reports a failure instead of throwing', async () => {
    mockModule.Content.getChildren.mockRejectedValueOnce(new FakeSpotifyError('CONNECTION_LOST'));

    const result = await getContentChildren({
      title: 'Cardio',
      subtitle: null,
      identifier: 'folder',
      uri: 'spotify:playlist:folder-uri',
      isPlayable: false,
      isContainer: true,
    });

    expect(result).toEqual({ items: [], error: 'Lost the connection to Spotify.' });
  });
});

describe('playSpotifyContent', () => {
  it('plays the given uri via an unvalidated SpotifyURI, since it already came from the SDK', async () => {
    await expect(playSpotifyContent('spotify:playlist:abc123')).resolves.toBeNull();

    expect(mockModule.SpotifyURI.unsafe).toHaveBeenCalledWith('spotify:playlist:abc123');
    expect(mockModule.Player.play).toHaveBeenCalledWith('spotify:playlist:abc123');
  });

  it('reports Premium-required rather than letting it escape into a render', async () => {
    mockModule.Player.play.mockRejectedValueOnce(new FakeSpotifyError('PREMIUM_REQUIRED'));

    await expect(playSpotifyContent('spotify:track:xyz')).resolves.toBe(
      'Spotify Premium is needed to control playback.',
    );
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

  it('silently resumes a stored session on mount, without ever showing "connecting"', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());

    const { result } = await renderHook(() => useSpotifyPlayer());

    await waitFor(() =>
      expect(mockModule.AppRemote.connect).toHaveBeenCalledWith('stored-access-token'),
    );
    // Nothing about this path is a user action, so it must never claim to be "connecting" —
    // the real state comes from the `connectionStateChange` listener once `connect()` lands.
    expect(result.current.connectionState).not.toBe('connecting');
  });

  it('never wakes Spotify from the silent mount-time resume', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    mockModule.AppRemote.connect.mockRejectedValue(new FakeSpotifyError('CONNECTION_FAILED'));

    await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalled());

    expect(mockModule.AppRemote.authorizeAndPlay).not.toHaveBeenCalled();
  });

  it('retries a silent resume that fails right as the app returns to the foreground, never waking Spotify', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    mockModule.AppRemote.connect
      .mockRejectedValueOnce(new FakeSpotifyError('CONNECTION_FAILED'))
      .mockResolvedValue(undefined);

    await renderHook(() => useSpotifyPlayer());

    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    expect(mockModule.AppRemote.authorizeAndPlay).not.toHaveBeenCalled();
  });

  it('does not surface the native connection error that a silent resume attempt triggers', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    mockModule.AppRemote.connect.mockImplementationOnce(async () => {
      emit('connectionError', { code: 'CONNECTION_FAILED', message: 'gone' });
      throw new FakeSpotifyError('CONNECTION_FAILED');
    });

    const { result } = await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.lastError).toBeNull();
  });

  it('does nothing on mount when already connected', async () => {
    mockModule.AppRemote.isConnected.mockReturnValue(true);
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());

    await renderHook(() => useSpotifyPlayer());
    // Give any stray microtask a turn before asserting the negative.
    await act(async () => {});

    expect(mockModule.AppRemote.connect).not.toHaveBeenCalled();
  });

  it('resumes again when the app returns to the foreground after the connection dropped', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1));

    // The App Remote link dropped (a phone call, another app, the screen locking) and the app is
    // now back in front — this is the event the user currently has to notice and re-tap Connect
    // for; it should instead just work.
    await act(async () => mockAppStateChangeHandler?.('active'));

    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(2));
  });

  it('does not attempt a foreground resume while already connected', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1));
    mockModule.AppRemote.isConnected.mockReturnValue(true);

    await act(async () => mockAppStateChangeHandler?.('active'));
    await act(async () => {});

    expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1);
  });

  it('ignores a transition to the background — only "active" is a resume opportunity', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1));

    await act(async () => mockAppStateChangeHandler?.('background'));
    await act(async () => {});

    expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1);
  });

  it('removes the AppState subscription on unmount', async () => {
    mockLoadStoredSpotifySession.mockResolvedValue(storedSession());
    const { unmount } = await renderHook(() => useSpotifyPlayer());
    await waitFor(() => expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1));

    await unmount();
    await act(async () => mockAppStateChangeHandler?.('active'));

    expect(mockModule.AppRemote.connect).toHaveBeenCalledTimes(1);
  });
});
