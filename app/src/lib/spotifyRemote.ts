/**
 * The app's whole surface over Spotify. One small wrapper around `@wwdrew/expo-spotify-sdk` (which
 * wraps Spotify's native iOS App Remote SDK) so screens never touch the native module directly —
 * the same shape, and for the same reasons, as `workoutAudio.ts`.
 *
 * **Why App Remote and not the Web API — for playback.** iOS gives a third-party app no way to
 * drive another app's playback: `MPRemoteCommandCenter` receives commands about your *own* audio
 * and `MPMusicPlayerController` is Apple Music only. Of Spotify's two routes, App Remote is IPC to
 * the Spotify process already running on this device, so every transport button and every actual
 * `Player.play` here keeps working with no network call of our own — the Web API would need a
 * round trip per press and an "active device", which is precisely wrong for a workout in a park.
 *
 * **The one deliberate exception: `getFitnessContent` uses the Web API, for browsing only.** App
 * Remote has no search and no "list playlists" — its `Content` namespace only offers a personalised
 * recommendation feed, which turned out to be full of playlists nowhere near a workout and
 * non-playable section rows (see that function's own header). Finding *new* music by name genuinely
 * needs a request this app makes, not just one Spotify's own app makes internally — there is no way
 * around that being a real trade against the "no network of our own" rule above. Everything after a
 * search result is picked — previewing a playlist's tracks, playing it — goes back over App Remote
 * with no further network call of ours; see `getFitnessContent`'s header for the full reasoning.
 * That search is steered by user-chosen genre/era "vibes" (`spotifyVibes.ts`) and deliberately
 * randomised (sampled queries, shallow random offsets, shuffled output) so it isn't the same list
 * on every open.
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
 *
 * **Connecting once should stay connected, not reconnect on every interruption.** User-reported:
 * having to tap Connect on every app launch, every workout, and every backgrounding (a phone call,
 * switching to another app, the screen locking) made the feature feel broken. Two things were
 * true before this paragraph was added: (1) the session (access token + refresh token) lived only
 * in the native SDK's memory, gone the instant the process died — cold launch or device restart —
 * so the only way back was the full interactive `Auth.authenticate()` bounce through Spotify's own
 * auth screen; (2) nothing ever reattached automatically when the app came back to the foreground
 * after the App Remote IPC link dropped (which it does on every backgrounding), so even *within*
 * the same process the user had to notice and re-tap. `spotifySession.ts` persists the refresh
 * token to the Keychain so it survives both of those; `resumeSpotifySession` below is what uses it
 * — tried first by `connectSpotify` (so even an explicit tap skips the interactive screen whenever
 * possible) and by `useSpotifyPlayer`'s mount/foreground effect (so most reconnects need no tap at
 * all). Silent resume never calls `authorizeAndPlay` (which foregrounds Spotify) — that stays
 * gated on `allowWake`, true only for the explicit-tap path, so an automatic reattach can never
 * hijack the screen mid-workout the way `connectSpotify`'s own header already rules out for the
 * first-ever connect.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  clearStoredSpotifySession,
  loadStoredSpotifySession,
  saveStoredSpotifySession,
  type StoredSpotifySession,
} from './spotifySession';
import { FITNESS_NAME, resolveVibeQueries } from './spotifyVibes';

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
 * One row of the browse sheet — a playlist from `getFitnessContent`'s search, or one of its tracks
 * from `getContentChildren`. Deliberately not the library's own `ContentItem`: same reasoning as
 * `SpotifyTrack` above, and the native side only ever reads `uri` back off whatever is handed to
 * `Content.getChildren`/`Player.play` (confirmed against the native source, not assumed), so
 * trimming to exactly what the browse UI shows is safe, not just convenient.
 */
export interface SpotifyContentItem {
  title: string | null;
  subtitle: string | null;
  identifier: string;
  uri: string;
  /** Can be started directly with `playSpotifyContent`. */
  isPlayable: boolean;
  /** Can be drilled into with `getContentChildren` — a playlist folder, or a playlist's own
   *  tracks. Not mutually exclusive with `isPlayable`: a playlist row is usually both. */
  isContainer: boolean;
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

/** The native layer's error `code`, or `''` when whatever was thrown doesn't carry one. Shared by
 *  `describeError` and every place below that needs to branch on *which* failure this was rather
 *  than just report it. */
function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

/**
 * Turns whatever the native layer threw into a sentence worth showing mid-workout. The library's
 * error codes are precise but they are developer-facing; a user holding a plank wants to know
 * whether to keep going or reach for their phone.
 */
function describeError(error: unknown): string {
  const code = errorCode(error);
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
    // The rest are reachable once `Content`/`Player.play` are in the mix (browsing/playing a
    // workout playlist), not just the original transport controls.
    case 'NOT_CONNECTED':
    case 'CONNECTION_LOST':
      return 'Lost the connection to Spotify.';
    case 'CONTENT_API_UNAVAILABLE':
      return 'Spotify’s workout picks aren’t available right now.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Spotify won’t allow that right now.';
    default:
      return 'Spotify didn’t respond.';
  }
}

/** The minimum App Remote needs — control and read. Nothing here reads a library, a profile, or
 *  anything else, and asking for scopes we don't use would be asking the user to grant access we
 *  have no reason to hold. Shared between the interactive `authenticate()` call and the silent
 *  `refresh()` one, since a refreshed token has to carry the same grant as the one it replaces. */
const SPOTIFY_SCOPES = ['app-remote-control', 'user-read-playback-state'];

/** How much of an access token's remaining lifetime is still worth using as-is rather than
 *  refreshing pre-emptively. Generous on purpose: refreshing needs a network round trip and this
 *  is the difference between a truly zero-network reconnect (common case: token still has most of
 *  its ~1hr life left) and one that silently costs a request the user never notices either way. */
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;

/** Persists a session from the library's own shape, but only when it's actually resumable — no
 *  `refreshToken` means nothing here could ever reattach without the interactive screen anyway
 *  (see `spotifySession.ts`'s header on why `refreshToken` is required, not optional, there). */
function persistResumableSession(session: {
  accessToken: string;
  refreshToken: string | null;
  expirationDate: number;
  scopes: string[];
}): Promise<void> {
  if (!session.refreshToken) return Promise.resolve();
  const stored: StoredSpotifySession = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expirationDate: session.expirationDate,
    scopes: session.scopes,
  };
  return saveStoredSpotifySession(stored);
}

interface ResumeOutcome {
  connected: boolean;
  /** Set only when a fresh interactive sign-in couldn't fix this either (right now: Premium being
   *  required) — surfacing it immediately saves the user a pointless bounce to Spotify's own auth
   *  screen just to hit the exact same wall a second later. `null` for every other failure (no
   *  stored session, a dead refresh token, Spotify not running with waking disallowed, a network
   *  hiccup): those are all reasonable to either fall through to interactive auth for (the
   *  explicit-tap caller) or just stay quietly disconnected for (the silent background caller). */
  blockingError: SpotifyErrorMessage;
}

const NOT_RESUMED: ResumeOutcome = { connected: false, blockingError: null };

/** The stored access token if it has real life left, else a silently refreshed one (persisted),
 *  else null — no refresh URL configured, a dead refresh token (which is cleared, since it can
 *  never work again), or the network being down (session left alone; it may work next time). */
async function freshAccessToken(
  mod: SpotifyModule,
  stored: StoredSpotifySession,
): Promise<string | null> {
  if (Date.now() < stored.expirationDate - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
    return stored.accessToken;
  }
  const tokenRefreshURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL;
  if (!tokenRefreshURL) return null;
  try {
    const renewed = await mod.Auth.refresh({
      refreshToken: stored.refreshToken,
      tokenRefreshURL,
      scopes: stored.scopes as unknown as Parameters<SpotifyModule['Auth']['refresh']>[0]['scopes'],
    });
    await persistResumableSession(renewed);
    return renewed.accessToken;
  } catch (error) {
    // A dead refresh token (revoked from the user's Spotify account, or genuinely expired) can
    // never succeed again on its own — clear it so the next attempt goes straight to interactive
    // auth instead of paying a network round trip to fail the same way every time.
    if (errorCode(error) === 'REFRESH_TOKEN_EXPIRED') await clearStoredSpotifySession();
    return null;
  }
}

/** Delays before each extra silent `connect()` try. Right as RoamFit returns to the foreground,
 *  Spotify's App Remote server is often not accepting connections yet (it was suspended while
 *  another app was in front), so the first attempt fails and a second one a moment later succeeds —
 *  which is what the manual button was doing for the user. */
const SILENT_RETRY_DELAYS_MS = [500, 1500];

/** How many silent `connect()` calls are in flight — while non-zero, the native `connectionError`
 *  event is expected noise (the failure is handled by retrying, or by quietly staying disconnected)
 *  and must not reach the user as "Couldn't reach the Spotify app". */
let silentConnectsInFlight = 0;

function connectWithSilentRetries(
  mod: SpotifyModule,
  accessToken: string,
  allowWake: boolean,
): Promise<void> {
  // An explicit tap falls through to `authorizeAndPlay` on failure, so it never needs retries.
  if (allowWake) return mod.AppRemote.connect(accessToken);
  return (async () => {
    silentConnectsInFlight += 1;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await mod.AppRemote.connect(accessToken);
          return;
        } catch (error) {
          if (errorCode(error) !== 'CONNECTION_FAILED' || attempt >= SILENT_RETRY_DELAYS_MS.length) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, SILENT_RETRY_DELAYS_MS[attempt]));
        }
      }
    } finally {
      // Deferred a tick: the native error event can land just after the promise rejects.
      setTimeout(() => {
        silentConnectsInFlight -= 1;
      }, 250);
    }
  })();
}

async function attemptResume(
  mod: SpotifyModule,
  options: { allowWake: boolean },
): Promise<ResumeOutcome> {
  if (mod.AppRemote.isConnected()) return { connected: true, blockingError: null };

  const stored = await loadStoredSpotifySession();
  if (!stored) return NOT_RESUMED;

  const accessToken = await freshAccessToken(mod, stored);
  if (!accessToken) return NOT_RESUMED;

  try {
    await connectWithSilentRetries(mod, accessToken, options.allowWake);
    return { connected: true, blockingError: null };
  } catch (error) {
    if (errorCode(error) !== 'CONNECTION_FAILED') {
      return {
        connected: false,
        blockingError: errorCode(error) === 'PREMIUM_REQUIRED' ? describeError(error) : null,
      };
    }
    // `connect()` only attaches to an already-running Spotify. Waking a suspended/terminated one
    // (`authorizeAndPlay`) foregrounds it — exactly the disruption `connectSpotify`'s own header
    // rules out for anything that isn't a deliberate tap, so a silent background resume stops here
    // rather than doing it uninvited mid-workout.
    if (!options.allowWake) return NOT_RESUMED;
    try {
      await mod.AppRemote.authorizeAndPlay(accessToken);
      return { connected: true, blockingError: null };
    } catch (wakeError) {
      return {
        connected: false,
        blockingError:
          errorCode(wakeError) === 'PREMIUM_REQUIRED' ? describeError(wakeError) : null,
      };
    }
  }
}

/** Collapses concurrent resume attempts (the mount effect and the foreground effect can both fire
 *  around the same moment, and this file's two call sites into `useSpotifyPlayer` per screen — see
 *  its own header — would otherwise each try their own refresh/connect) into one real attempt. */
let resumeInFlight: Promise<ResumeOutcome> | null = null;

/**
 * Reattaches to Spotify using whatever was last persisted, entirely without the interactive
 * `Auth.authenticate()` screen — silently, and usually without any network call at all (a still-
 * fresh access token goes straight to `AppRemote.connect()`). This is what turns "reconnect" from
 * "redo the OAuth bounce" into "resume the session that was already granted," for a cold app
 * launch, a device restart, or the ordinary mid-workout in-and-out of another app.
 *
 * `options.allowWake` gates `authorizeAndPlay` (see `attemptResume`'s own comment) — pass `true`
 * only for a call the user just asked for.
 */
function resumeSpotifySession(options: { allowWake: boolean }): Promise<ResumeOutcome> {
  const mod = loadModule();
  if (!mod) return Promise.resolve(NOT_RESUMED);
  if (!resumeInFlight) {
    resumeInFlight = attemptResume(mod, options).finally(() => {
      resumeInFlight = null;
    });
  }
  return resumeInFlight;
}

/**
 * Connect: resume a persisted session if at all possible, and only fall back to the full
 * interactive OAuth bounce when there is truly nothing to resume from.
 *
 * **Authorization Code, not Implicit Grant.** Spotify sunset the Implicit Grant flow on
 * 2025-11-27 (the OAuth migration Spotify announced on its developer blog); asking for it now
 * gets the auth webview rejected mid-flow, which showed up on device as `Auth.authenticate()`
 * throwing "Unable to open URL: about:blank" — the abandoned session reporting back whatever it
 * last showed rather than a real redirect. `tokenSwapURL`/`tokenRefreshURL` switch the SDK to
 * Authorization Code, which needs the client secret exchanged server-side (`functions/`) since
 * the app can never hold it — see `docs/SPOTIFY-SETUP.md`. Without both configured, connecting
 * would only ever retry the dead flow, so this fails fast with a sentence instead.
 *
 * The `CONNECTION_FAILED` retry below is not defensive padding — it is the normal path. `connect()`
 * can only attach to an *already-running* Spotify, and iOS suspends backgrounded apps aggressively,
 * so the common case (phone in a pocket, Spotify not touched today) fails first and succeeds on
 * `authorizeAndPlay`, which wakes Spotify, starts playback and then connects. That it starts
 * playback is a feature here: someone tapping Connect at the top of a workout wants music.
 */
export async function connectSpotify(): Promise<SpotifyErrorMessage> {
  const mod = loadModule();
  if (!mod) return 'Spotify isn’t set up in this build.';
  if (!mod.Auth.isAvailable()) return 'Spotify isn’t installed on this phone.';

  // `allowWake: true` — this is the one call site where the user just explicitly asked to
  // connect, so foregrounding a suspended Spotify (if it comes to that) is expected, not a
  // surprise. Every other outcome here except "actually connected" falls through to the
  // interactive flow below, same as if nothing had ever been persisted.
  const resumed = await resumeSpotifySession({ allowWake: true });
  if (resumed.connected) return null;
  if (resumed.blockingError) return resumed.blockingError;

  // Read per call, not at module load: `EXPO_PUBLIC_` vars are inlined by Metro at bundle time in
  // a real build, but reading them lazily here (rather than into a module-level const) is what
  // lets tests for the configured and unconfigured cases set `process.env` before calling this,
  // without fighting ES import hoisting evaluating this module before that assignment runs.
  const tokenSwapURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL;
  const tokenRefreshURL = process.env.EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL;
  if (!tokenSwapURL || !tokenRefreshURL) {
    return 'Spotify sign-in isn’t finished setting up on this build (no token swap server).';
  }

  try {
    // iOS can leak an in-flight authorization if a previous attempt was interrupted; clearing it
    // first is what makes a retry actually retry rather than reject as AUTH_IN_PROGRESS.
    await mod.Auth.cancelPending();
    const session = await mod.Auth.authenticate({
      scopes: SPOTIFY_SCOPES as unknown as Parameters<
        SpotifyModule['Auth']['authenticate']
      >[0]['scopes'],
      tokenSwapURL,
      tokenRefreshURL,
    });
    await persistResumableSession(session);
    try {
      await mod.AppRemote.connect(session.accessToken);
    } catch (error) {
      if (errorCode(error) !== 'CONNECTION_FAILED') throw error;
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

/** One page of Spotify content — either the top-level feed, or one item's children. */
export interface SpotifyContentResult {
  items: SpotifyContentItem[];
  error: SpotifyErrorMessage;
}

function toContentItem(item: {
  title: string | null;
  subtitle: string | null;
  identifier: string;
  uri: string;
  isPlayable: boolean;
  isContainer: boolean;
}): SpotifyContentItem {
  return {
    title: item.title,
    subtitle: item.subtitle,
    identifier: item.identifier,
    uri: item.uri,
    isPlayable: item.isPlayable,
    isContainer: item.isContainer,
  };
}

interface SearchedPlaylist {
  id: string;
  uri: string;
  name: string;
  owner?: { display_name?: string | null } | null;
  tracks?: { total?: number } | null;
}

/** Fisher–Yates, in place, driven by `random` so tests can seed it. */
function shuffleInPlace<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Queries sampled per open — enough spread to feel different each time, few enough to stay cheap. */
const QUERIES_PER_SEARCH = 6;
/** Result pages a query may start from. Deliberately shallow: search relevance falls off fast, so
 *  offsets past ~40 trade the "different every open" win for off-topic playlists. */
const SEARCH_OFFSETS = [0, 10, 20, 30];

/**
 * Fitness playlists by name, via the Spotify Web API's public playlist search. The App Remote
 * "recommended: fitness" feed this used to call is personalised — it returned playlists in the
 * user's own taste, mostly not workout material, plus non-playable section rows. Search needs no
 * scope beyond the access token the session already holds.
 *
 * **Vibes and randomization.** `vibeIds` (see `spotifyVibes.ts`; empty = anything) become a pool of
 * workout-worded queries ("metal gym", "90s cardio"). Each call samples up to six distinct queries
 * from that pool and gives each a random shallow `offset`, then shuffles the merged list — so the
 * same vibe yields a different set on every open instead of the same top-ten forever. Playlists
 * whose ids are in `excludeIds` (e.g. ones the caller already showed) are skipped. The name filter
 * and dedupe still apply; the engine-decides rule is untouched — this only picks *what to show*
 * for the user to choose from. `random` is injectable for deterministic tests.
 *
 * One failed query no longer sinks the search: results from the queries that succeeded are used,
 * and the error is returned only if every query failed.
 *
 * This is the one deliberate exception to "everything here works over App Remote with no network
 * of our own" — there is no search in App Remote at all, and asking "am I able to choose songs or
 * switch playlists" honestly means admitting *finding* something new needs a request our app makes,
 * not just one Spotify's own app makes internally. Every result is still a real Spotify playlist
 * URI, so what happens *after* a search — previewing its tracks (`getContentChildren`) and actually
 * playing it (`playSpotifyContent`) — goes over App Remote exactly like everything else in this
 * file, with no further network call of ours: `isContainer: true` below is what lets the browse
 * sheet offer that preview, since a playlist is, to App Remote, a container of tracks regardless of
 * whether search or App Remote's own feed is what found it.
 */
export async function getFitnessContent(
  vibeIds: readonly string[] = [],
  opts: { random?: () => number; excludeIds?: ReadonlySet<string> } = {},
): Promise<SpotifyContentResult> {
  const random = opts.random ?? Math.random;
  const mod = loadModule();
  if (!mod) return { items: [], error: 'Spotify isn’t set up in this build.' };
  try {
    const stored = await loadStoredSpotifySession();
    const token = stored ? await freshAccessToken(mod, stored) : null;
    if (!token) return { items: [], error: 'Reconnect Spotify to browse workout playlists.' };

    const queries = shuffleInPlace(resolveVibeQueries(vibeIds), random).slice(
      0,
      QUERIES_PER_SEARCH,
    );
    const settled = await Promise.allSettled(
      queries.map(async (q) => {
        const offset = SEARCH_OFFSETS[Math.floor(random() * SEARCH_OFFSETS.length)];
        const res = await fetch(
          `https://api.spotify.com/v1/search?type=playlist&limit=10&offset=${offset}&q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`search ${res.status}`);
        const body = (await res.json()) as { playlists?: { items?: (SearchedPlaylist | null)[] } };
        return body.playlists?.items ?? [];
      }),
    );
    const responses = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (responses.length === 0) throw new Error('every search failed');

    const seen = new Set<string>();
    const items: SpotifyContentItem[] = [];
    // Round-robin across queries so one search's results don't crowd out the others (the final
    // shuffle then randomises order; round-robin still decides which hits are kept first).
    for (let i = 0; i < 10; i++) {
      for (const list of responses) {
        const p = list[i];
        if (
          !p ||
          !p.uri ||
          seen.has(p.id) ||
          opts.excludeIds?.has(p.id) ||
          !FITNESS_NAME.test(p.name)
        )
          continue;
        seen.add(p.id);
        items.push({
          title: p.name,
          subtitle: p.owner?.display_name ?? null,
          identifier: p.id,
          uri: p.uri,
          isPlayable: true,
          // A playlist is a container of tracks — `getContentChildren` can preview them over App
          // Remote, no further network call, regardless of how this URI was found.
          isContainer: true,
        });
      }
    }
    return { items: shuffleInPlace(items, random), error: null };
  } catch {
    return { items: [], error: 'Couldn’t reach Spotify to find playlists.' };
  }
}

/** Previews a playlist's own tracks (from `getFitnessContent`'s search results) over App Remote —
 *  no network call of ours, unlike finding the playlist in the first place. */
export async function getContentChildren(item: SpotifyContentItem): Promise<SpotifyContentResult> {
  const mod = loadModule();
  if (!mod) return { items: [], error: 'Spotify isn’t set up in this build.' };
  try {
    const items = await mod.Content.getChildren(
      item as unknown as Parameters<SpotifyModule['Content']['getChildren']>[0],
    );
    return { items: items.map(toContentItem), error: null };
  } catch (error) {
    return { items: [], error: describeError(error) };
  }
}

/** Starts playback of a track/album/playlist URI from `getFitnessContent`/`getContentChildren` —
 *  always an already-valid Spotify URI, hence `SpotifyURI.unsafe` (not `.from`'s validation),
 *  exactly the case the library's own docs carve that out for. Premium-only, like every other
 *  on-demand playback call — `describeError` already has a sentence for that. */
export function playSpotifyContent(uri: string): Promise<SpotifyErrorMessage> {
  return transport((mod) => mod.Player.play(mod.SpotifyURI.unsafe(uri)));
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
 * Note what this deliberately does *not* do: interactively auto-connect. Nothing here ever calls
 * `connectSpotify()`/`Auth.authenticate()` on its own — that can foreground Spotify or pop its auth
 * screen, and a screen that hijacked the foreground on mount or on every backgrounding would be
 * intolerable mid-workout. What it *does* do on its own is quietly try to resume an already-granted
 * session (`resumeSpotifySession({ allowWake: false })`) on mount and every time the app returns to
 * the foreground — this can only reattach to a Spotify that's already running and can only ever
 * make `connectionState` go forward to `'connected'`, never pop anything onto the screen. That
 * silent reattach is what makes reconnecting after a phone call, another app, or the screen
 * locking a non-event instead of a trip back to the "Connect Spotify" button.
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
      if (silentConnectsInFlight > 0 && errorCode(event) === 'CONNECTION_FAILED') return;
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

  useEffect(() => {
    const mod = loadModule();
    if (!mod) return;

    // Covers a cold app launch and a remount after an earlier workout in the same process — both
    // just mean "there might be a still-good session nobody has reattached to yet," which is
    // exactly what a no-op `isConnected()` check up front in `attemptResume` makes this safe to
    // always try. Errors are deliberately not surfaced here (see the hook's own header): a failed
    // silent resume just leaves `connectionState` at whatever it already was.
    void resumeSpotifySession({ allowWake: false });

    // The other half: `AppRemote`'s IPC link drops every time the app backgrounds (a phone call,
    // switching to YouTube, the screen locking), which was previously the user's cue to go tap
    // Connect again. Reattaching the moment the app is frontmost again is what turns that into
    // nothing happening at all, from the user's side.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resumeSpotifySession({ allowWake: false });
    });

    return () => subscription.remove();
  }, []);

  /** Runs one transport/connect promise and posts its outcome to `lastError`. Every action shares
   *  this so none of them can quietly swallow a failure. */
  const run = useCallback((operation: () => Promise<SpotifyErrorMessage>) => {
    setLastError(null);
    void operation().then(setLastError);
  }, []);

  const connect = useCallback(() => {
    setConnectionState((state) => (state === 'disconnected' ? 'connecting' : state));
    setLastError(null);
    // Unlike every other action, a failure here has nowhere else to go: the native
    // `connectionStateChange` event is what normally moves `connectionState` on, but a failed
    // authenticate/connect never fires it (Spotify never got far enough to have a state to
    // report). Without this, a cancelled auth or a bounce back to RoamFit with no connection
    // leaves the button reading "Connecting…" forever — `run()` alone only sets `lastError`.
    void connectSpotify().then((error) => {
      setLastError(error);
      if (error) setConnectionState((state) => (state === 'connecting' ? 'disconnected' : state));
    });
  }, []);

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
