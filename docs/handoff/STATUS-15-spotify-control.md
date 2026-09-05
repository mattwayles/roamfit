## Track: 15-spotify-control — Control Spotify from the active workout screen

Last updated: 2026-09-05 (Authorization Code migration)

Request: "I want a component on the active workout screen to control Spotify so I don't have to
swap between apps during a workout."

### Done

- [x] Dependency + `app.config.js` + `scheme` in `app.json` + this file — 7115c04
- [x] `app/src/lib/spotifyRemote.ts` + both test files (25 cases) — 1c6ce26
- [x] `app/src/components/SpotifyControls.tsx` + tests (11 cases) — 45e5686
- [x] Wired into `WorkoutScreen.tsx` + `WorkoutScreen.spotify.test.tsx` (4 cases) — e0ade15
- [x] `docs/SPOTIFY-SETUP.md` + backlog entries

- [x] Fix: `connect()` never recovered from a failed auth bounce — `spotifyRemote.ts`,
  `spotifyRemote.test.ts`

### Bug found on device: "Unable to open URL: about:blank"

Reported after the "connecting forever" fix above shipped: `connect()` now fails cleanly, but the
underlying auth attempt itself started throwing this on every try.

**Root cause.** Spotify sunset the Implicit Grant OAuth flow on 2025-11-27. This integration used
that flow deliberately (see the now-stale "Why you reconnect once per app launch" reasoning that
used to be in `docs/SPOTIFY-SETUP.md`) specifically because it needs no backend. Every
`Auth.authenticate()` call since the sunset date asks `SPTSessionManager` to run a flow Spotify's
authorization server now rejects mid-flow; the abandoned auth webview reports back whatever it
last showed instead of a real `roamfit://` redirect, which is `about:blank`. Confirmed by pulling
`@wwdrew/expo-spotify-sdk`'s actual source (npm-packed, not from `node_modules` — this environment
has no native deps installed) and Spotify's own developer-blog OAuth migration post; no
`Linking.openURL('about:blank')` exists anywhere in our code or the SDK's JS/Swift, ruling out a
call-site bug on our end.

**Fix.** Migrated to Authorization Code, the only flow Spotify still accepts:

- `functions/src/spotifyTokenSwap.ts` (+ `spotifyTokenSwap.test.ts`, 6 cases) — the token-swap
  server `@wwdrew/expo-spotify-sdk`'s `tokenSwapURL`/`tokenRefreshURL` need, matching that
  package's documented server contract exactly (fetched from its GitHub `docs/guides/
  token-swap-server.md`, not in the npm package). Pure, `fetch`-injected, no `firebase-functions`
  import — same discipline as `handlers.ts` — so it's Jest-testable without real credentials.
- `functions/src/index.ts` — wires it in as two plain `onRequest` exports (`spotifyTokenSwap`,
  `spotifyTokenRefresh`; NOT `onCall` — the native SDK POSTs form-urlencoded directly, no Firebase
  callable envelope). New `defineSecret('SPOTIFY_CLIENT_SECRET')` and two `defineString` params
  (`SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`).
- `app/src/lib/spotifyRemote.ts` — `connectSpotify()` now reads `EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL`
  / `EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL` per call (Metro inlines `EXPO_PUBLIC_` vars at bundle
  time — no `expo-constants`, no native config plugin needed) and passes them into
  `Auth.authenticate()`. Fails fast with a sentence if either is unset, rather than ever attempting
  the dead Implicit Grant flow again.
- `docs/SPOTIFY-SETUP.md` — added the deploy-the-server steps; `docs/BACKLOG.md` updated to say
  this is now required, not optional.
- `.gitignore` — added `functions/.env.*` (the file `firebase deploy` saves `defineString` params
  to isn't matched by the existing `.env`/`.env.*.local` patterns).

**Not deployed, and not reverifiable on device from this environment** — same limitation as
everything else in this file: this environment has no Firebase credentials and no physical phone.
`npm run check` is green (functions: 9 suites/34 tests; app: 63 suites/382 tests), which proves the
swap/refresh HTTP contract and the JS-side gating, not that a real Spotify auth round-trip works.

### In progress

- Nothing. `npm run check` is green.

### Next — needs the user to deploy `functions/` and rebuild, none of it needs more code

0. Deploy the token-swap server and rebuild per the new steps in `docs/SPOTIFY-SETUP.md` — this is
   now a hard requirement to connect at all, not an optional nice-to-have.

1. Re-verify on the phone: a real auth bounce and return; connecting with Spotify suspended (the
   `authorizeAndPlay` path — the ordinary one); play/pause/skip actually driving playback; the bar
   surviving a backgrounded app; and the cue tones still mixing over Spotify rather than pausing it
   (that is `workoutAudio.ts`'s session, untouched here, but it is the regression this feature is
   most likely to be blamed for).
2. If Premium is not on the account, expect connect to succeed and the buttons to report
   `PREMIUM_REQUIRED`. That is Spotify's restriction, not a bug to chase.

### Bug found on device: "Connecting…" never clears

Reported: prebuild + redeploy done, Spotify opens, fails to connect, bounces RoamFit back to the
foreground, and the connect button is stuck on "Connecting…" permanently.

**Root cause.** `connect()` in `useSpotifyPlayer` optimistically flips `connectionState` to
`'connecting'`, but until this fix the *only* code path that ever moved it out of `'connecting'`
was the native `connectionStateChange` listener. When `connectSpotify()` fails outright — auth
cancelled, or the whole `authenticate` → `connect`/`authorizeAndPlay` sequence never reaches a
connected state — Spotify never has a connection state to report, so that event never fires, and
the button is stuck forever. The generic `run()` helper (used by every other transport action)
only ever set `lastError`; `connect()` needs to also reset `connectionState` itself since it's the
one caller where a failure has nowhere else to be reported from.

**Fix.** `connect()` now awaits `connectSpotify()` directly (not through `run()`) and, on a
non-null error, resets `connectionState` from `'connecting'` back to `'disconnected'` — same
functional-update guard style already used elsewhere in the file, so a connection that *did*
land via the listener in the meantime isn't clobbered. Added a regression test:
"drops back to disconnected when the auth bounce fails, instead of sticking on 'connecting'
forever" in `spotifyRemote.test.ts`.

**Not yet reverified on device** — the fix is Jest-provable (the failure path is exercised) but the
actual auth-bounce-and-fail sequence on a physical phone is not, per the existing device-only list
above. Worth also checking *why* the connect is failing at all (Spotify app version, redirect URI
registration exactly matching `roamfit://spotify-auth`, or an `AUTH_IN_PROGRESS` leak from a prior
attempt) — this fix makes the failure recoverable, it doesn't address why the first connect fails.

### Gotcha found while testing (worth knowing before writing any new component test)

`render`, `rerender` and `fireEvent.press` are **all async** under React 19 / RNTL 14. Leaving any
of them un-awaited holds an `act()` scope open past the end of the test, and the failure surfaces
on the *next* test: cases that pass in isolation fail in sequence, by timeout or by "unable to find
an element", with the error pointing at a component that is fine. Three un-awaited presses in one
case cost the four cases after it. The older component suites in `app/src/components` use the
un-awaited `render(...)` + `await waitFor(...)` shape and get away with it; they are one added
`fireEvent` away from the same trap.

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
