/**
 * Spotify Authorization Code token swap + refresh — the server half `docs/SPOTIFY-SETUP.md`
 * always said would be needed eventually. Spotify sunset the Implicit Grant flow on 2025-11-27
 * (see the OAuth migration announcement on the Spotify for Developers blog); every `connect()`
 * attempt since then has been asking `SPTSessionManager` to run a flow Spotify's servers now
 * reject mid-authorization, which is what surfaced on device as "Unable to open URL: about:blank"
 * — the abandoned auth webview reporting back whatever it last showed instead of a real redirect.
 *
 * Authorization Code needs the client secret exchanged for a token, and the app can never hold
 * that secret (same invariant `ANTHROPIC_API_KEY` sits behind in `config.ts`) — hence a server.
 * This one never sees a password or anything about the Spotify account beyond what the SDK itself
 * already handles: it takes the `code` or `refresh_token` the phone hands it and forwards it to
 * Spotify's own `/api/token`, with the client secret attached, then relays the response back
 * unchanged. The exact request/response shape below is `@wwdrew/expo-spotify-sdk`'s documented
 * token-swap-server contract (`docs/guides/token-swap-server.md` in that package) — the native
 * SDK's `SpotifyTokenRefreshClient.swift` parses these fields directly, so the shape is not
 * negotiable.
 *
 * Same discipline as `handlers.ts`: no `firebase-functions` import here, so this file stays
 * importable and unit-testable under Jest with a fake `fetch` and no real Spotify credentials.
 * `index.ts` is the only place that touches the real Cloud Functions runtime (secrets, `onRequest`).
 */

export type FetchFn = typeof fetch;

export interface SpotifyTokenSwapResult {
  status: number;
  contentType: string;
  body: string;
}

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function exchangeToken(
  fetchFn: FetchFn,
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
): Promise<SpotifyTokenSwapResult> {
  const response = await fetchFn(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body: new URLSearchParams(params).toString(),
  });
  // Forwarded verbatim, error responses included — the SDK's `SpotifyTokenRefreshClient` is what
  // detects `invalid_grant` in the body and maps it to `REFRESH_TOKEN_EXPIRED`. Rewriting or
  // summarizing the error here would just hide that from it.
  const body = await response.text();
  return { status: response.status, contentType: 'application/json', body };
}

/**
 * The `tokenSwapURL` endpoint. The SDK POSTs only `code`; the `redirect_uri` Spotify's token
 * endpoint requires has to be the exact one used in the authorize step, so it's this server's own
 * fixed config, not something read off the request.
 */
export function handleSpotifyTokenSwap(
  fetchFn: FetchFn,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  body: Record<string, string>,
): Promise<SpotifyTokenSwapResult> {
  const code = body.code;
  if (!code) {
    return Promise.resolve({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_request', error_description: 'missing code' }),
    });
  }
  return exchangeToken(fetchFn, clientId, clientSecret, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
}

/** The `tokenRefreshURL` endpoint. The SDK POSTs `refresh_token`; nothing else is trusted from the
 *  request — the client secret bound to this deployment is what actually authenticates it. */
export function handleSpotifyTokenRefresh(
  fetchFn: FetchFn,
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
): Promise<SpotifyTokenSwapResult> {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return Promise.resolve({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_request',
        error_description: 'missing refresh_token',
      }),
    });
  }
  return exchangeToken(fetchFn, clientId, clientSecret, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}
