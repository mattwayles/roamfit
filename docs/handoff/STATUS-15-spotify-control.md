## Track: 15-spotify-control — Control Spotify from the active workout screen

Last updated: 2026-09-05

Request: "I want a component on the active workout screen to control Spotify so I don't have to
swap between apps during a workout."

### Done

- (nothing yet — see In progress)

### In progress

- Increment 1: this status file + the dependency and native config.

### Next

1. `app/src/lib/spotifyRemote.ts` — the one surface over the native module, plus its tests.
2. `app/src/components/SpotifyControls.tsx` — the transport bar, plus its tests.
3. Wire into `WorkoutScreen.tsx` under the timer row, plus a screen test.
4. `docs/SPOTIFY-SETUP.md` — the one manual step (client ID) the user has to do themselves.

### Decisions / gotchas

**Transport: the Spotify iOS App Remote SDK, not the Web API.** iOS gives a third-party app no
other way to drive another app's playback — `MPRemoteCommandCenter` receives commands about your
*own* audio, and `MPMusicPlayerController` is Apple Music only. Of the two Spotify routes, App
Remote talks over IPC to the Spotify app already running on the device, so the buttons keep
working with no connectivity; the Web API (`/v1/me/player/*`) needs a round trip per button press
and an "active device", which is exactly wrong for a workout in a park. Invariant 1 doesn't
literally cover a music control, but the same reasoning applies to it.

**Dependency: `@wwdrew/expo-spotify-sdk@^2.3.2`** (a real Expo module wrapping Spotify iOS SDK
v5.0.1). The older `react-native-spotify-remote` was last published in 2022 and will not work
against RN 0.86 / the New Architecture. The `2.x` lane targets Expo SDK 56+ and needs iOS 16.4;
this app is Expo 57 and the Podfile already pins `16.4`, so both line up with nothing to change.
**This needs `expo prebuild` and a dev-client rebuild** — the iOS binary arrives as a CocoaPods
HTTP binary pod at `pod install`, so that first native build needs network.

**The client ID cannot be checked in, and cannot be invented.** It comes from the user's own
Spotify Developer dashboard app, whose redirect URI must be registered as `roamfit://spotify-auth`
exactly. `app.json` is static JSON and can't read an env var, so config moves to an `app.config.js`
that spreads `app.json` (Expo's documented layering: `app.json` is read first and handed to
`app.config.js` as `config`) and appends the Spotify plugin **only when `SPOTIFY_CLIENT_ID` is
set**. With it unset the app builds and runs exactly as before, the plugin injects nothing, and
the JS layer reports "not configured" rather than throwing. Nothing about this is a placeholder
waiting to rot in git.

**No token swap server, so no refresh token, so no persisted session.** Spotify's code+swap flow
wants a server endpoint holding the client secret. `functions/` exists but per the backlog has
never been deployed against a real Firebase project, and making a music control depend on
undeployed infrastructure is a bad trade. iOS's implicit TOKEN flow works without one and returns
an access token good for about an hour. That is longer than a workout, which is the entire window
this feature cares about — so the session is held in memory for the life of the app process and
nothing is written to SQLite. **No migration, and no OAuth token anywhere near a table that might
one day sync.** Re-auth on a cold launch is one tap that bounces through an already-authorized
Spotify and straight back. The swap-server upgrade is parked in the backlog.

**Native module absence is handled the way `workoutAudio.ts` handles `expo-audio`,** and for the
identical reason: `build/ExpoSpotifySDKModule.js` calls `requireNativeModule("ExpoSpotifySDK")` at
the top level, which *throws on import* when no native module is registered (i.e. under Jest, and
in any build made before the prebuild). So the import is lazy and try/caught, and every export
degrades to a no-op / "unavailable" — anything importing it stays importable under Jest.

**Their hooks are deliberately not used.** `useSession`/`usePlayerState`/etc. live behind that
same throwing import, and a hook that can't be called when the module is missing can't keep React's
hook order stable. `spotifyRemote.ts` exports its own `useSpotifyPlayer()` instead, which always
calls the same hooks, subscribes to the native listeners only when the module actually loaded, and
reports `available: false` otherwise. It is also the seam the component tests mock.

**Premium is required** for transport control — App Remote gives Free accounts `PREMIUM_REQUIRED`
on `play()` and thin player state. Nothing to do about it in code beyond surfacing the error
honestly; the component says so rather than looking broken.
