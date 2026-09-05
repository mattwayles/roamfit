/**
 * Dynamic layer over `app.json`. Expo reads the static `app.json` first and hands it to this
 * function as `config`, so everything that doesn't depend on the environment stays where it was —
 * this file exists for the one thing that does.
 *
 * **The Spotify client ID cannot be checked in.** It identifies *this developer's* app in the
 * Spotify Developer dashboard, and the dashboard entry has to carry the matching redirect URI
 * (`roamfit://spotify-auth`) before auth will resolve at all. Since `app.json` is static JSON and
 * cannot read an env var, the plugin is appended here instead, and only when `SPOTIFY_CLIENT_ID`
 * is actually set. With it unset the config is byte-for-byte what `app.json` already said: the
 * plugin injects nothing, no Spotify keys reach `Info.plist`, and the app builds and runs exactly
 * as it did before this feature existed. `spotifyRemote.ts` then reports the controls as
 * unavailable and the workout screen simply doesn't render them — an unconfigured build is a
 * quiet no-op, never a crash and never a broken-looking button.
 *
 * See `docs/SPOTIFY-SETUP.md` for the dashboard steps and how to supply the variable.
 */
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

module.exports = ({ config }) => {
  if (!SPOTIFY_CLIENT_ID) return config;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        '@wwdrew/expo-spotify-sdk',
        {
          clientID: SPOTIFY_CLIENT_ID,
          // Must match the redirect URI registered in the Spotify dashboard *exactly*:
          // `{scheme}://{host}` — i.e. `roamfit://spotify-auth`.
          scheme: 'roamfit',
          host: 'spotify-auth',
        },
      ],
    ],
  };
};
