/**
 * Persists the Spotify OAuth session (`spotifyRemote.ts`'s only caller) so "connect" is a one-time
 * cost rather than something paid again on every app launch, every workout, and every interruption
 * (a phone call, switching to another app, a device restart). Before this file existed, the
 * session lived only in the native SDK's in-memory state for the life of the process — gone the
 * instant the app was killed or the device restarted, at which point the only way back was the
 * full interactive `Auth.authenticate()` bounce through Spotify's own auth screen, which needs
 * connectivity to reach the token-swap server. See `spotifyRemote.ts`'s header for why that bounce
 * must never be silent/automatic — this file only ever hands back a token; deciding what to do
 * with it (silently reattach vs. wake Spotify) stays there.
 *
 * `expo-secure-store` (iOS Keychain), not `AsyncStorage` and not a SQLite table: a refresh token is
 * a long-lived credential, and this project's own SQLite tables are sync candidates (see
 * `docs/BACKLOG.md`'s "don't sync yet" list) — a secret has no business sitting in a table that
 * might one day get a Firestore mirror. Keychain data survives an app relaunch and a device
 * restart, and is cleared only on uninstall, which is exactly the lifetime this needs.
 */
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'spotify.session.v1';

/** Deliberately not `@wwdrew/expo-spotify-sdk`'s own `SpotifySession` type — re-exporting it would
 *  drag that module into this file's type graph, the same reasoning `spotifyRemote.ts`'s header
 *  gives for `SpotifyTrack`. `refreshToken` is required (not `string | null`): a session with no
 *  refresh token can't be silently resumed, so there is nothing worth persisting in that case. */
export interface StoredSpotifySession {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch milliseconds. */
  expirationDate: number;
  scopes: string[];
}

function isStoredSpotifySession(value: unknown): value is StoredSpotifySession {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredSpotifySession).accessToken === 'string' &&
    typeof (value as StoredSpotifySession).refreshToken === 'string' &&
    typeof (value as StoredSpotifySession).expirationDate === 'number' &&
    Array.isArray((value as StoredSpotifySession).scopes)
  );
}

/** Never throws — a Keychain read failure (corrupt entry, first run) is exactly the same as having
 *  nothing stored: the caller falls back to the ordinary interactive connect. */
export async function loadStoredSpotifySession(): Promise<StoredSpotifySession | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSpotifySession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Never throws — a failed write means the next resume falls back to interactive connect, not a
 *  crash mid-workout over what is genuinely just a convenience cache. */
export async function saveStoredSpotifySession(session: StoredSpotifySession): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Best-effort — see file header.
  }
}

/** Called when a refresh token is confirmed dead (Spotify's `REFRESH_TOKEN_EXPIRED`, or the user
 *  revoked RoamFit's access from their Spotify account) — keeping a token known not to work around
 *  would just make every future launch retry it and fail the same way. */
export async function clearStoredSpotifySession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Best-effort — see file header.
  }
}
