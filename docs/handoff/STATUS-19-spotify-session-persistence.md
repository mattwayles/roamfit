## Track: 19 — Spotify: persist the session, resume it silently
Last updated: 2026-09-29

### Read before starting
`docs/SPOTIFY-SETUP.md` (rewritten this track — read the current version, not memory of an
earlier one), `app/src/lib/spotifyRemote.ts`'s own header, STATUS-15-spotify-control.md for the
original build of this feature.

### Done
- [x] **User-reported bug fixed**: had to tap "Connect Spotify" on every app launch, every new
  workout, and every interruption mid-workout (phone call, another app, screen lock). Root cause
  was two compounding gaps: the OAuth session (access token + refresh token) lived only in the
  native SDK's memory, gone the instant the process died; and nothing ever reattached the App
  Remote IPC link automatically when the app returned to the foreground after it dropped (which it
  does on every backgrounding).
  - `app/src/lib/spotifySession.ts` (new) — persists `{ accessToken, refreshToken, expirationDate,
    scopes }` to the iOS Keychain via `expo-secure-store` (new dependency, added to `package.json`
    and `app.json`'s plugins — needs `expo prebuild --clean` + `pod install` to pick up, same as
    any native module addition). Deliberately Keychain, not a SQLite table: a refresh token is a
    credential, and `users`/`progression_state` are noted sync candidates in this same file — a
    secret has no business in a table that might one day get a Firestore mirror.
  - `app/src/lib/spotifyRemote.ts` — `resumeSpotifySession`/`attemptResume`: reuses a still-fresh
    stored access token directly (zero network), silently calls `Auth.refresh()` when it's expired
    (network, but no interactive screen), and only ever calls the foregrounding
    `AppRemote.authorizeAndPlay` when `allowWake: true` (the explicit-tap path). `connectSpotify()`
    now tries this first, so even a manual tap usually skips the interactive OAuth bounce entirely
    after the very first grant. `useSpotifyPlayer()` tries it silently on mount and on every
    `AppState` transition to `'active'` — this is the actual fix for "reconnect after backgrounding
    without a tap."
  - A dead refresh token (`REFRESH_TOKEN_EXPIRED` — revoked from the user's Spotify account, or
    genuinely expired) clears the stored session so the next attempt goes straight to interactive
    auth instead of retrying a token that can never work. A merely-unreachable one (network error)
    is left alone.
  - Tests: `spotifySession.test.ts` (12), new `describe`s in `spotifyRemote.test.ts` covering
    resume-via-connect (zero-network reuse, silent refresh, wake-with-resumed-token, dead-token
    clearing, Premium-required short-circuit) and resume-via-`useSpotifyPlayer` (mount, foreground,
    already-connected no-op, background-transition no-op, unmount cleanup) — 68 Spotify-related
    tests total, all passing.
- [x] `docs/SPOTIFY-SETUP.md` and `docs/BACKLOG.md` updated — both previously documented "you
  reconnect once per app launch" as expected/deliberate, which was stale even before this track
  (that description matched the old Implicit Grant flow; Authorization Code has returned a real
  refresh token since the OAuth migration, nothing was persisting it).
  `npm run check` green throughout (app 76/470, engine 26/1213, data 1/12, store 26/179,
  functions 9/34, engine-purity OK).

### Follow-up 2026-10-16 — still reconnecting after backgrounding
- Hypothesis (device-unverified): on foreground `isConnected()` is stale-true, so the resume no-ops,
  then the native `disconnected` arrives and nothing retries. `useSpotifyPlayer` now also resumes
  silently on a connected → disconnected edge while `AppState` is active (edge only, so a failed
  resume's own `disconnected` can't loop); silent retries extended to 500/1500/3000ms.
- Not changed: silent resume still never calls `authorizeAndPlay`. If Spotify itself is suspended,
  `connect()` cannot attach and only the tap (which wakes Spotify) works. If the device pass still
  shows Connect, that is the cause and the decision is whether to allow wake on foreground.

### In progress
- Nothing.

### Next
- **Device run owed, same shape as every other Spotify claim in this codebase**: nothing under
  Jest can prove a refresh token actually survives a real device restart, that `Auth.refresh()`
  actually reaches the deployed `spotifyTokenRefresh` function, or that the foreground resume
  genuinely produces zero perceived delay after a real phone call. All three are asserted in code
  and tests below the native boundary, not observed on a device.
  - Steps to verify: connect once, force-quit RoamFit (or restart the device), relaunch, and
    confirm the transport bar shows connected/reattaches without a tap. Then background the app
    mid-workout (a real call or switching apps) and confirm the same on return.
- `expo prebuild --platform ios --clean && pod install` needs to be re-run to link
  `expo-secure-store` before any of this can be exercised on a simulator/device — not yet done
  this track (no `ios/` rebuild was run).
- `handleExtend`/`handleSkip` in `RestPhase` (`WorkoutScreen.tsx`, unrelated screen) still `await`
  `cancelRestNotification`/`scheduleRestZeroNotification` before their own follow-up work — noted
  in STATUS-18 as a lower-risk instance of the same "don't await best-effort background work on a
  user-facing action" class of bug this track's sibling fix addressed. Not touched here; still open
  if either is ever found to stick in practice.

### Decisions / gotchas
- **New dependency**: `expo-secure-store` (`~57.0.4`). Chosen over `AsyncStorage` specifically
  because a refresh token is a credential — Keychain-backed storage is the only appropriate place
  for it in this codebase, not a stylistic preference.
- **Mocking a module a production file imports eagerly, inside a `jest.mock` factory that closes
  over an outer variable, silently fails** (the exported function reads back as `undefined`, not a
  ReferenceError) — Babel hoists `import`-derived `require()`s above the test file's own top-level
  `const`s, so the factory runs before a same-file `const mockX = jest.fn()` initializer has. This
  bit `spotifyRemote.test.ts`'s new mock for `spotifySession.ts` (which `spotifyRemote.ts` imports
  with a plain top-level `import`, unlike the SDK module, which is only ever `require()`d lazily
  inside a function specifically to dodge this exact class of problem). Fixed by switching to
  Jest's no-factory auto-mock (`jest.mock('./spotifySession')`) + `jest.mocked(realExport)` to get
  typed handles — no closure, no ordering hazard. Worth remembering before reaching for the
  factory-with-outer-`const` pattern for any *other* plain (non-native) local module a file under
  test imports eagerly.
- `AppState` from `react-native` is mocked at the specific submodule path
  (`react-native/Libraries/AppState/AppState`), not by spreading over the whole `react-native`
  package via `jest.requireActual` — the latter drags in `DevMenu` and other native-only modules
  that crash on import under Jest. `react-native/index.js`'s own `AppState` export is a lazy getter
  requiring that exact submodule, so mocking it there is transparent to any `import { AppState }
  from 'react-native'` elsewhere.
