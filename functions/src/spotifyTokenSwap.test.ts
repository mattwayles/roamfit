import {
  handleSpotifyTokenRefresh,
  handleSpotifyTokenSwap,
  type FetchFn,
} from './spotifyTokenSwap';

// `RequestInit`/`Response` are DOM lib types, not runtime globals — the functions package's eslint
// config only loads Node globals, so naming them directly here trips `no-undef`. `Parameters`/
// `Awaited` sidestep that by deriving the shapes from `FetchFn` itself instead of naming the types.
type FetchInit = Parameters<FetchFn>[1];
type FetchResponse = Awaited<ReturnType<FetchFn>>;

function fakeFetch(
  status: number,
  body: string,
): { fetchFn: FetchFn; calls: FetchInit[]; urls: string[] } {
  const calls: FetchInit[] = [];
  const urls: string[] = [];
  const fetchFn = jest.fn(async (url: string, init: FetchInit) => {
    urls.push(url);
    calls.push(init);
    return {
      status,
      text: async () => body,
    } as FetchResponse;
  }) as unknown as FetchFn;
  return { fetchFn, calls, urls };
}

describe('handleSpotifyTokenSwap', () => {
  it('exchanges the authorization code with Basic auth and the fixed redirect URI', async () => {
    const { fetchFn, calls, urls } = fakeFetch(
      200,
      JSON.stringify({ access_token: 'BQA...', expires_in: 3600, refresh_token: 'AQA...' }),
    );

    const result = await handleSpotifyTokenSwap(
      fetchFn,
      'client-id',
      'client-secret',
      'roamfit://spotify-auth',
      { code: 'auth-code-123' },
    );

    expect(urls[0]).toBe('https://accounts.spotify.com/api/token');
    const init = calls[0]!;
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Basic base64("client-id:client-secret")
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(init.body).toBe(
      'grant_type=authorization_code&code=auth-code-123&redirect_uri=roamfit%3A%2F%2Fspotify-auth',
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      access_token: 'BQA...',
      expires_in: 3600,
      refresh_token: 'AQA...',
    });
  });

  it('rejects with 400 before ever touching the network if the SDK sent no code', async () => {
    const { fetchFn, calls } = fakeFetch(200, '{}');

    const result = await handleSpotifyTokenSwap(
      fetchFn,
      'client-id',
      'client-secret',
      'roamfit://spotify-auth',
      {},
    );

    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('forwards a Spotify error response unchanged, so an expired refresh token is still detectable', async () => {
    // The SDK's SpotifyTokenRefreshClient looks for "invalid_grant" in the raw body to map to
    // REFRESH_TOKEN_EXPIRED — this proves the body isn't summarized or wrapped on the way through.
    const { fetchFn } = fakeFetch(400, JSON.stringify({ error: 'invalid_grant' }));

    const result = await handleSpotifyTokenSwap(
      fetchFn,
      'client-id',
      'client-secret',
      'roamfit://spotify-auth',
      {
        code: 'stale-code',
      },
    );

    expect(result.status).toBe(400);
    expect(result.body).toContain('invalid_grant');
  });
});

describe('handleSpotifyTokenRefresh', () => {
  it('exchanges the refresh token with Basic auth, no redirect_uri involved', async () => {
    const { fetchFn, calls } = fakeFetch(
      200,
      JSON.stringify({ access_token: 'BQA-new', expires_in: 3600 }),
    );

    const result = await handleSpotifyTokenRefresh(fetchFn, 'client-id', 'client-secret', {
      refresh_token: 'AQA...',
    });

    expect(calls[0]!.body).toBe('grant_type=refresh_token&refresh_token=AQA...');
    expect(result.status).toBe(200);
  });

  it('rejects with 400 before ever touching the network if the SDK sent no refresh_token', async () => {
    const { fetchFn, calls } = fakeFetch(200, '{}');

    const result = await handleSpotifyTokenRefresh(fetchFn, 'client-id', 'client-secret', {});

    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
