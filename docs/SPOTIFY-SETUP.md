# Spotify controls — the one-time setup

The transport bar on the active workout screen is built and tested, but it stays invisible until
this is done once. Everything below is a step only you can take: it needs a Spotify account and a
dashboard entry that identifies *your* build.

Until then the app behaves exactly as it did before the feature existed — no row, no placeholder,
no error. That is deliberate (`app/app.config.js` appends the plugin only when the client ID is
present), so nothing here is urgent and nothing is broken while it waits.

## What you need

- **Spotify Premium.** App Remote hands Free accounts `PREMIUM_REQUIRED` on playback control. The
  bar will connect and show the track, but the buttons won't drive it. There is no way around this
  from our side — it's Spotify's restriction, not a limitation of the integration.
- **The Spotify app installed on the phone**, signed in. The controls talk to that app over IPC on
  the device; there is no separate player here and no audio of our own.

## 1. Register the app with Spotify

1. Go to <https://developer.spotify.com/dashboard> and sign in.
2. **Create app**. Name and description are yours to pick — nothing in the app reads them.
3. Add this **exact** redirect URI:

   ```
   roamfit://spotify-auth
   ```

   It has to match character for character. It is `{scheme}://{host}` from `app/app.config.js`,
   and a mismatch fails at the moment of authorization with nothing useful on screen.
4. Under **Which API/SDKs are you planning to use**, tick **iOS**.
5. Save, then copy the **Client ID** from the app's settings page — you'll need the **Client
   Secret** too, in "Deploy the token-swap server" below, but never put it in the app build or the repo.

## 2. Give the build the client ID

The ID is read from the environment at build time, so it never enters git:

```sh
export SPOTIFY_CLIENT_ID=<the client id you just copied>
```

Put that in your shell profile, or prefix the build commands with it. `app/app.config.js` picks it
up and appends the config plugin; with it unset the resolved config is byte-for-byte what
`app/app.json` already said.

## 3. Deploy the token-swap server

**This step didn't used to be optional-but-nice; it's now required.** Spotify sunset the Implicit
Grant flow on 2025-11-27 — the flow this integration used to rely on for zero-backend auth. Every
`connect()` attempt against that flow now fails on device with "Unable to open URL: about:blank".
Authorization Code is the only flow Spotify still accepts, and it needs the client secret
exchanged for a token server-side (the app can never hold that secret) — that's what
`functions/src/spotifyTokenSwap.ts` is for. It's written and unit-tested; it just isn't live yet.

1. Copy the **Client Secret** from the same Spotify dashboard app page as the Client ID (previous
   step). Never commit it, hardcode it, or put it in a `.env` file.
2. Set it as a Cloud Functions secret:
   ```sh
   cd functions
   firebase functions:secrets:set SPOTIFY_CLIENT_SECRET
   ```
3. `SPOTIFY_CLIENT_ID` (the same Client ID from step 1) and `SPOTIFY_REDIRECT_URI` (already
   defaults to `roamfit://spotify-auth`; only needs setting if you changed the scheme) are Cloud
   Functions v2 `defineString` params — `firebase deploy` prompts for any that are unset and, if
   you say yes, saves them to `functions/.env.<project-id>` for next time. Not secret, but not
   nothing either: confirm that file lands in `.gitignore` (it should match the existing
   `.env.*.local`/`.env` patterns — check before committing anything if it doesn't).
4. Deploy:
   ```sh
   firebase deploy --only functions:spotifyTokenSwap,functions:spotifyTokenRefresh
   ```
5. Note the two deployed HTTPS URLs Firebase prints (`https://<region>-<project>.cloudfunctions.net/spotifyTokenSwap`
   and the `spotifyTokenRefresh` sibling, or the Cloud Run–style URL if your project uses 2nd-gen
   naming) — the app needs them next.

## 4. Give the app build the swap server URLs

Same mechanism as `SPOTIFY_CLIENT_ID`, but these two are read directly in JS (Metro inlines any
`EXPO_PUBLIC_`-prefixed env var into the bundle at build time — no native config plugin needed):

```sh
export EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL=<the spotifyTokenSwap URL from the previous step>
export EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL=<the spotifyTokenRefresh URL from the previous step>
```

Without both of these set, `connectSpotify()` fails fast with "Spotify sign-in isn't finished
setting up on this build" rather than attempting the dead Implicit Grant flow.

## 5. Rebuild the dev client

This adds a native module, so a JS reload is not enough:

```sh
cd app
npx expo prebuild --platform ios --clean
npm run ios
```

The first `pod install` downloads the Spotify iOS binary (it ships as a CocoaPods HTTP binary
pod), so that build needs network. Later builds don't.

## 6. Check it on the phone

1. Open Spotify, play something, then switch to RoamFit.
2. Start a workout. The bar sits under the stage label, above the exercise.
3. Tap **Connect Spotify**. The first time, Spotify's authorization screen appears; after that it
   is a fast bounce out and back.
4. The track and artist appear, with previous / play-pause / next.

## What to expect, and what isn't a bug

- **It briefly switches to Spotify when you connect and Spotify wasn't running.** `connect()` can
  only attach to an already-running Spotify, and iOS suspends backgrounded apps, so the app is
  woken and playback started — which is what you wanted anyway. Connecting is always a tap and
  never happens on its own, precisely so this can't happen mid-set.
- **You reconnect once per app launch.** See below — this is unrelated to the token-swap server;
  it's because the session is only ever held in memory, never persisted to SQLite.
- **Skip buttons grey out during an advert.** Spotify reports the restriction and the buttons
  follow it, rather than looking live and doing nothing.
- **Cue tones and the demo video still mix over the music** — that's the audio session
  `workoutAudio.ts` configures, unchanged by any of this. If beeps ever start pausing Spotify
  again, that file's header is where to look, not this feature.

## Why you reconnect once per app launch

The session (access token + refresh token) is held in memory for the life of the app process and
never written to SQLite or synced anywhere — reconnecting on a cold launch is one tap that bounces
through an already-authorized Spotify and straight back. That's a deliberate scope cut, not a
symptom of the token-swap server: nothing here writes an OAuth token anywhere near a table that
might one day sync.

This used to also be true for a different reason — the old Implicit Grant flow returned a token
good for about an hour with no refresh token at all, so there was nothing *to* persist. That's no
longer why: Authorization Code (step 3 above) does return a refresh token, and the iOS SDK uses
`tokenRefreshURL` to renew the access token automatically while the app is running. Persisting that
refresh token across launches (so reconnecting is a no-op instead of a tap) would be the next step
if the one-tap reconnect ever becomes annoying — it's parked in `docs/BACKLOG.md`.
