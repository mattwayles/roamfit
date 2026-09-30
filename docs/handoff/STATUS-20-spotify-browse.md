## Track: 20 — Spotify: browse and play a workout playlist
Last updated: 2026-09-29

### Read before starting
`app/src/lib/spotifyRemote.ts`'s own header (rewritten this track — read the current version),
STATUS-19-spotify-session-persistence.md (the reconnect-persistence track this one sits on top of).

### Done
- [x] User asked, after the session-persistence fix: "can I get any more Spotify functionality
  ... choose songs or switch playlists?" Answered honestly against what the SDK actually offers
  (no search, no "list my playlists" — that needs the Web API), then built the one thing that is
  possible: browse-and-play a workout playlist.
  - `app/src/lib/spotifyRemote.ts` — `getFitnessContent()` (searches Spotify's **Web API**
    `/v1/search` for playlists by workout terms — `workout`/`gym`/`hiit`/`running`/
    `strength training`/`cardio`, name-filtered and deduped against a regex so unrelated "vibe"
    playlists that only matched on description/owner don't sneak in), `getContentChildren()`
    (previews a playlist's own tracks over **App Remote** — `Content.getChildren`, no network of
    ours), `playSpotifyContent()` (`Player.play` via `SpotifyURI.unsafe`, since the uri always
    already came from the SDK).
  - `app/src/components/SpotifyControls.tsx` — a "🏋" button on the transport row opens a bottom
    sheet (`Modal`): search results list, tap a row to play, tap its chevron to preview tracks
    first (one level of drill-in, with a back chevron), × to close. Loading/empty/error states
    handled inline; a failed play (e.g. Premium required) keeps the sheet open rather than
    silently closing.
  - New `SpotifyErrorMessage` cases for codes only reachable once `Content`/`Player.play` are in
    the mix: `NOT_CONNECTED`/`CONNECTION_LOST` → "Lost the connection to Spotify.",
    `CONTENT_API_UNAVAILABLE` → "Spotify's workout picks aren't available right now.",
    `OPERATION_NOT_ALLOWED` → "Spotify won't allow that right now."
  - Tests: `spotifyRemote.test.ts` (`getFitnessContent`/`getContentChildren`/`playSpotifyContent`),
    `SpotifyControls.test.tsx` (open/load/play/drill-in/back/close/error paths). 85 Spotify-related
    tests total across both files plus `spotifySession.test.ts`/`WorkoutScreen.spotify.test.tsx`.
  - `npm run check` is green end to end (typecheck, lint, test, engine-purity) — app 76/487,
    engine 26/1213, data 1/12, store 26/179, functions 9/34.
- [x] **Fixed, on request**: `workoutAudio.ts`'s three `no-undef` errors on `__DEV__` (a
  concurrent, unrelated change had introduced real usages of it with no matching ESLint global —
  see Decisions/gotchas). `eslint.config.js` gained a scoped block: `__DEV__: 'readonly'` for
  `app/**/*.ts(x)` only, since it's a Metro/Expo bundler global, meaningless in the `engine`/
  `store`/`data`/`functions` workspaces. Not this track's own regression, but it was blocking the
  full check chain, so fixed here rather than left for later.

### In progress
- Nothing.

### Next
- **Device run owed**, on top of everything already owed from STATUS-15/-19: a real search hitting
  `api.spotify.com`, a real drill-in showing real tracks, a real play actually starting a chosen
  playlist. Nothing under Jest can prove any of that; the tests here prove call shape and UI wiring
  only.
- The six `FITNESS_SEARCHES` terms and the `FITNESS_NAME` filter regex are a first pass, not tuned
  against real search results — expect to revisit both once a device run shows what actually comes
  back (false positives/negatives in the name filter, terms that return nothing useful, etc).

### Decisions / gotchas
- **A different, concurrent Claude Code session edited these exact files while this track was in
  progress**, replacing an in-flight `Content.getRecommendedContentItems('fitness')`-based browse
  implementation with the Web-API-search one described above, and touching `workoutAudio.ts` (the
  source of the now-failing lint) and several other files unrelated to Spotify (engine
  prescription/selection/timefit, `WorkoutScreen.tsx`, `HomeScreen.tsx`, `DemoMedia.tsx`) not
  reviewed as part of this track. Surfaced to the user rather than silently reconciled or reverted;
  the user chose to keep the Web-API-search version, reasoning that a pure-App-Remote browse can
  only ever show Spotify's own personalised recommendation feed, never help *find* something new,
  which was the actual ask. This track's work is the result of reconciling on top of that decision
  — fixing the header comments the interleaved edits left inconsistent/garbled, and changing
  `isContainer` from `false` to `true` on search results (a playlist is a container of tracks, so
  the already-built drill-in preview isn't dead code, it's the right UI for exactly this data).
  **If two sessions are ever found editing the same files again, stop and ask before reconciling** —
  don't assume either version is "right" without checking, and don't keep editing a file that might
  change under you again mid-task.
- `getFitnessContent` is the one function in this file that calls `fetch` directly rather than
  going through the SDK — deliberate and documented at length in its own header (App Remote has no
  search), not an oversight of the "no network of our own" principle the rest of the file holds to.
