/**
 * The app's whole surface over Spotify. One small wrapper around `@wwdrew/expo-spotify-sdk` (which
 * wraps Spotify's native iOS App Remote SDK) so screens never touch the native module directly —
 * the same shape, and for the same reasons, as `workoutAudio.ts`.
 *
 * **Why App Remote and not the Web API.** iOS gives a third-party app no way to drive another
 * app's playback: `MPRemoteCommandCenter` receives commands about your *own* audio and
 * `MPMusicPlayerController` is Apple Music only. Of Spotify's two routes, App Remote is IPC to the
 * Spotify process already running on this device, so every button here keeps working with no
 * connectivity — the Web API would need a network round trip per press and an "active device",
 * which is precisely wrong for a workout in a park.
 *
 * **The import must stay lazy and try/caught.** `ExpoSpotifySDKModule.js` calls
 * `requireNativeModule("ExpoSpotifySDK")` at the top level, which *throws on import* whenever no
 * native module is registered — under Jest, and in any build made before `expo prebuild` ran with
 * `SPOTIFY_CLIENT_ID` set. This is the identical hazard `workoutAudio.ts` documents for
 * `expo-audio`, handled the identical way: nothing that imports this file can be made
 * un-importable by the native module's absence, and every export degrades to
 * unavailable/no-op instead. Actual playback control is consequently **Jest-unverifiable by
 * construction** — the tests here prove "never throws, reports unavailable, calls the right
 * method when the module is present," not "Spotify actually skipped a track."
 *
 * **Why this file exports its own hook instead of the library's.** The library ships
 * `useSession`/`usePlayerState`/`useIsPlaying`/etc., but they live behind that same throwing
 * import — and a hook that cannot be called when the module is missing cannot keep React's hook
 * order stable across a render. `useSpotifyPlayer()` below always calls the same hooks in the same
 * order, subscribes to native listeners only when the module actually loaded, and reports
 * `available: false` otherwise. It is also the seam the component tests mock.
 *
 * **Premium is required.** App Remote hands Free accounts `PREMIUM_REQUIRED` on playback calls and
 * thin player state. There is nothing to do about that in code beyond surfacing it honestly, which
 * `lastError` exists for — a control that looks broken is worse than one that says why.
 *
 * **The audio session is already right and this file must not touch it.** `workoutAudio.ts`
 * configures `mixWithOthers`, which is what lets cue tones layer over Spotify instead of pausing
 * it (see that file's header — getting this wrong failed silently for a whole release). Spotify
 * owns its own session in its own process; nothing here calls `setAudioModeAsync`.
 */
import { useCallback, useEffect, useState } from 'react';

type SpotifyModule = typeof import('@wwdrew/expo-spotify-sdk');

/** Mirrors the library's `ConnectionState`, restated so callers don't import the module's types
 *  (which would defeat the lazy import) and so `'unavailable'` — no native module at all, a state
 *  the library has no concept of — is representable in the same field. */
export type SpotifyConnectionState = 'unavailable' | 'disconnected' | 'connecting' | 'connected';

/** The only track fields anything on the workout screen shows. Deliberately not the library's
 *  `Track`: re-exporting that type would drag the module into every importer's type graph. */
export interface SpotifyTrack {
  name: string;
  artist: string;
}

/**
 * Why a button is unavailable, in the user's words rather than an error code. `null` when nothing
 * has gone wrong. Kept as a plain string because every consumer does the same thing with it —
 * renders it — and an enum would only be re-mapped to these sentences at the call site.
 */
export type SpotifyErrorMessage = string | null;

let moduleCache: SpotifyModule | null | undefined;

function loadModule(): SpotifyModule | null {
  if (moduleCache !== undefined) return moduleCache;
  try {
    // Must be lazy/try-caught, see the file header: a static `import` throws immediately when the
    // native module is not registered (under Jest, or in a build made before `expo prebuild`).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('@wwdrew/expo-spotify-sdk') as SpotifyModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

/** Test seam only — `loadModule` memoizes deliberately (the require is not free and the module is
 *  a singleton), so a test that swaps the module has to be able to clear that. */
export function __resetSpotifyModuleCacheForTests(): void {
  moduleCache = undefined;
}

/** Whether the native module is present at all. False under Jest, and in any build made before
 *  `expo prebuild` ran with `SPOTIFY_CLIENT_ID` set — in which case the workout screen renders no
 *  Spotify UI whatsoever rather than a button that cannot work. */
export function isSpotifySupported(): boolean {
  return loadModule() != null;
}

/**
 * Turns whatever the native layer threw into a sentence worth showing mid-workout. The library's
 * error codes are precise but they are developer-facing; a user holding a plank wants to know
 * whether to keep going or reach for their phone.
 */
function describeError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  switch (code) {
    case 'SPOTIFY_NOT_INSTALLED':
      return 'Spotify isn’t installed on this phone.';
    case 'PREMIUM_REQUIRED':
      return 'Spotify Premium is needed to control playback.';
    case 'USER_CANCELLED':
      // Not a failure — the user backed out of the Spotify auth screen on purpose. Returning a
      // sentence anyway (rather than null) keeps the caller's error handling uniform; it reads as
      // a statement of fact, which is all it is.
      return 'Not connected.';
    case 'INVALID_CONFIG':
      return 'Spotify isn’t set up in this build.';
    case 'NETWORK_ERROR':
      return 'Couldn’t reach Spotify to sign in.';
    case 'CONNECTION_FAILED':
      return 'Couldn’t reach the Spotify app.';
    default:
      return 'Spotify didn’t respond.';
  }
}

/**
 * Authenticate, then attach to the running Spotify app.
 *
 * The `CONNECTION_FAILED` retry is not defensive padding — it is the normal path. `connect()` can
 * only attach to an *already-running* Spotify, and iOS suspends backgrounded apps aggressively, so
 * the common case (phone in a pocket, Spotify not touched today) fails first and succeeds on
 * `authorizeAndPlay`, which wakes Spotify, starts playback and then connects. That it starts
 * playback is a feature here: someone tapping Connect at the top of a workout wants music.
 *
 * Scopes are the minimum App Remote needs — control and read. Nothing here reads a library, a
 * profile, or anything else, and asking for scopes we don't use would be asking the user to grant
 * access we have no reason to hold.
 */
export async function connectSpotify(): Promise<SpotifyErrorMessage> {
  const mod = loadModule();
  if (!mod) return 'Spotify isn’t set up in this build.';

  try {
    if (!mod.Auth.isAvailable()) return 'Spotify isn’t installed on this phone.';
    // iOS can leak an in-flight authorization if a previous attempt was interrupted; clearing it
    // first is what makes a retry actually retry rather than reject as AUTH_IN_PROGRESS.
    await mod.Auth.cancelPending();
    const session = await mod.Auth.authenticate({
      scopes: ['app-remote-control', 'user-read-playback-state'],
    });
    try {
      await mod.AppRemote.connect(session.accessToken);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code !== 'CONNECTION_FAILED') throw error;
      await mod.AppRemote.authorizeAndPlay(session.accessToken);
    }
    return null;
  } catch (error) {
    return describeError(error);
  }
}

/**
 * Every transport call funnels through here. They differ only in which method they call, and each
 * one has the same two obligations — never throw into a render, and say why if it failed — so
 * writing them out separately would be four chances to get that pair wrong.
 */
async function transport(
  action: (mod: SpotifyModule) => Promise<void>,
): Promise<SpotifyErrorMessage> {
  const mod = loadModule();
  if (!mod) return 'Spotify isn’t set up in this build.';
  try {
    await action(mod);
    return null;
  } catch (error) {
    return describeError(error);
  }
}

export function spotifyResume(): Promise<SpotifyErrorMessage> {
  return transport((mod) => mod.Player.resume());
}

export function spotifyPause(): Promise<SpotifyErrorMessage> {
  return transport((mod) => mod.Player.pause());
}

export function spotifySkipNext(): Promise<SpotifyErrorMessage> {
  return transport((mod) => mod.Player.skipNext());
}

export function spotifySkipPrevious(): Promise<SpotifyErrorMessage> {
  return transport((mod) => mod.Player.skipPrevious());
}

/** What `useSpotifyPlayer` hands its caller. */
export interface SpotifyPlayer {
  /** False when there is no native module — render nothing at all, not a dead button. */
  available: boolean;
  connectionState: SpotifyConnectionState;
  /** Null until Spotify reports its first player state, which is shortly after connecting. */
  track: SpotifyTrack | null;
  isPlaying: boolean;
  /** Spotify's own restrictions — an ad, or a radio context, genuinely cannot be skipped. Buttons
   *  gate on these so a press that Spotify would refuse is visibly unavailable instead. */
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  lastError: SpotifyErrorMessage;
  connect: () => void;
  togglePlay: () => void;
  skipNext: () => void;
  skipPrevious: () => void;
  /** Clears `lastError` — the component calls this when the user acts again, so a stale failure
   *  doesn't sit under a control that has since started working. */
  clearError: () => void;
}

/**
 * Subscribes to the Spotify app's connection and player state for as long as the component using
 * it is mounted.
 *
 * Note what this deliberately does *not* do: auto-connect. Connecting can foreground Spotify (see
 * `connectSpotify`), and a screen that hijacks the foreground on mount would be intolerable — the
 * user is mid-workout. Connection is always a tap.
 */
export function useSpotifyPlayer(): SpotifyPlayer {
  const available = isSpotifySupported();
  const [connectionState, setConnectionState] = useState<SpotifyConnectionState>(
    available ? 'disconnected' : 'unavailable',
  );
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canSkipNext, setCanSkipNext] = useState(true);
  const [canSkipPrevious, setCanSkipPrevious] = useState(true);
  const [lastError, setLastError] = useState<SpotifyErrorMessage>(null);

  useEffect(() => {
    const mod = loadModule();
    if (!mod) return;

    // Seed from the synchronous snapshot rather than waiting for the first event: this component
    // remounts on every workout, and a connection established during an earlier one is still live.
    setConnectionState(mod.AppRemote.isConnected() ? 'connected' : 'disconnected');

    const connection = mod.AppRemote.addListener('connectionStateChange', ({ state }) => {
      setConnectionState(state);
      // A dropped connection leaves whatever was last playing on screen, which would be a lie the
      // moment Spotify moves on without us.
      if (state !== 'connected') {
        setTrack(null);
        setIsPlaying(false);
      }
    });
    const connectionError = mod.AppRemote.addListener('connectionError', (event) => {
      setLastError(describeError(event));
    });
    const player = mod.Player.addListener('playerStateChange', (state) => {
      setTrack({ name: state.track.name, artist: state.track.artist.name });
      setIsPlaying(!state.isPaused);
      setCanSkipNext(state.playbackRestrictions.canSkipNext);
      setCanSkipPrevious(state.playbackRestrictions.canSkipPrevious);
    });

    return () => {
      connection.remove();
      connectionError.remove();
      player.remove();
      // Deliberately no `disconnect()` here. The connection belongs to the app, not to this
      // screen: dropping it on unmount would kill the music every time the user finished a
      // workout or stepped into exercise detail and back.
    };
  }, []);

  /** Runs one transport/connect promise and posts its outcome to `lastError`. Every action shares
   *  this so none of them can quietly swallow a failure. */
  const run = useCallback((operation: () => Promise<SpotifyErrorMessage>) => {
    setLastError(null);
    void operation().then(setLastError);
  }, []);

  const connect = useCallback(() => {
    setConnectionState((state) => (state === 'disconnected' ? 'connecting' : state));
    run(connectSpotify);
  }, [run]);

  const togglePlay = useCallback(() => {
    // Optimistic: Spotify's state event is a round trip through another process, and a play/pause
    // button that waits for it feels stuck. The listener above is the source of truth and will
    // correct this within a frame or two if the call failed.
    setIsPlaying((playing) => !playing);
    run(isPlaying ? spotifyPause : spotifyResume);
  }, [isPlaying, run]);

  const skipNext = useCallback(() => run(spotifySkipNext), [run]);
  const skipPrevious = useCallback(() => run(spotifySkipPrevious), [run]);
  const clearError = useCallback(() => setLastError(null), []);

  return {
    available,
    connectionState,
    track,
    isPlaying,
    canSkipNext,
    canSkipPrevious,
    lastError,
    connect,
    togglePlay,
    skipNext,
    skipPrevious,
    clearError,
  };
}
