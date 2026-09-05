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
5. Save, then copy the **Client ID** from the app's settings page. (Not the client secret — it is
   never needed here, and must never end up in the repo. See "Why no token swap server" below.)

## 2. Give the build the client ID

The ID is read from the environment at build time, so it never enters git:

```sh
export SPOTIFY_CLIENT_ID=<the client id you just copied>
```

Put that in your shell profile, or prefix the build commands with it. `app/app.config.js` picks it
up and appends the config plugin; with it unset the resolved config is byte-for-byte what
`app/app.json` already said.

## 3. Rebuild the dev client

This adds a native module, so a JS reload is not enough:

```sh
cd app
npx expo prebuild --platform ios --clean
npm run ios
```

The first `pod install` downloads the Spotify iOS binary (it ships as a CocoaPods HTTP binary
pod), so that build needs network. Later builds don't.

## 4. Check it on the phone

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
- **You reconnect once per app launch.** See below.
- **Skip buttons grey out during an advert.** Spotify reports the restriction and the buttons
  follow it, rather than looking live and doing nothing.
- **Cue tones and the demo video still mix over the music** — that's the audio session
  `workoutAudio.ts` configures, unchanged by any of this. If beeps ever start pausing Spotify
  again, that file's header is where to look, not this feature.

## Why you reconnect once per app launch

Spotify's refresh-token flow needs a server endpoint holding your client secret. `functions/`
exists but has never been deployed against a real Firebase project, and making the music controls
depend on undeployed infrastructure would be a bad trade — so this uses iOS's implicit flow, which
needs no server and returns an access token good for about an hour. That is longer than a workout,
which is the only window this feature cares about. Nothing is written to SQLite, and no OAuth token
goes anywhere near a table that might one day sync.

If reconnecting each launch becomes annoying, the upgrade is a token swap server — it's parked in
`docs/BACKLOG.md`.
