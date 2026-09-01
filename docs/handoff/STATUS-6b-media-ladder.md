## Track: 6b-media-ladder — The three-tier media ladder (§11.4)
Last updated: 2026-08-31

### Status
Done, pending orchestrator sign-off. `npm run check` green (typecheck, lint, all workspace
tests, `check:engine-purity`) at every commit boundary below. HEAD before this track was
`55bf665`, tree clean.

### Done (commit shas)
- [x] `81b2a1e` — ramp-up; added `react-native-svg@15.15.4`, `react-native-webview@13.16.1`,
  `expo-network@~57.0.1` via `npx expo install` (SDK-57-pinned versions).
- [x] `ffdaba3` — `app/src/lib/mediaLadder.ts`: pure tier-selection rule + `youtube-nocookie.com`
  embed URL builder (muted, no autoplay, no fullscreen) + tier-3 search URL builder.
  `app/src/lib/networkStatus.ts`: lazy `expo-network` wrapper, safe-default-on-failure.
- [x] `a50e0f3` — `packages/store` migration `0004_video_flags.sql`
  (`exercise_state.video_flag_count`/`video_demoted_at`), `reportVideoIssue`/`getVideoFlagState`
  in `exerciseState.ts`, new `video_flag_reported` signal type.
- [x] `00e1683` — `app/src/components/DemoMedia.tsx`, the rendered ladder. Global Jest manual
  mocks for `react-native-webview` (throws at import under Jest) and `react-native-svg` (real
  `SvgXml` causes a post-teardown `require`, same failure class as issue #14).
- [x] `a9b0f8d` — wired into `WorkoutScreen.tsx` above the existing "How to" disclosure;
  `StoreContext` now exposes `figures` (the tier-2 SVG registry) alongside `library`/`families`.

### What I verified, and how
- **Tier-selection logic is correct** — `mediaLadder.test.ts` (11 cases): online+curated+
  unmetered+not-demoted → embed; every other combination → figure. Confirmed against a
  deliberately broken stub (always returns tier 2) that the "picks the curated embed" case fails
  first, then restored — the stub-vs-real diff is in the commit message.
- **Two-report demotion is correct** — `exerciseState.videoFlags.test.ts` (7 cases): 1 report
  doesn't demote, 2 does and stamps `demotedAt` once, a 3rd report doesn't move `demotedAt`, user
  reports and player-error flags share the counter, per-exercise isolation, signal event logged.
  Confirmed against a deliberately raised threshold (999) that 4/7 fail first (the ones that
  actually exercise demotion), then restored to 2.
- **DemoMedia's branch selection and callback wiring** — `DemoMedia.test.tsx` (10 cases): offline
  shows the figure + a calm indicator + zero webview instances; online-no-id shows figure +
  search link; online-with-id-eligible shows the embed + report control; demoted and metered both
  force the figure despite a curated id; a player `onError` falls back to the figure, fires
  `onPlayerError` exactly once (not again on a second synthetic error, since there's no longer a
  webview mounted to error); the report tap and the expand-once semantics both fire correctly.
  Confirmed against a deliberately broken `showEmbed` (ignoring `playerErrored`) that the
  player-error test fails first, then restored.
- **`getNetworkStatus()` never throws under Jest** — probed `expo-network` directly first
  (`getNetworkStateAsync()` resolves to `undefined` rather than throwing, unlike `expo-audio`'s
  throw-on-require); `networkStatus.test.ts` locks in the resulting safe-default behavior.
- **Whole-repo `npm run check`** green after every commit: typecheck (all 4 workspaces), eslint
  (0 errors), full Jest suite (app 77/77, engine 873/873, data 14/14, store 45/45 — up from 45/45
  pre-existing plus this track's additions), `check:engine-purity` OK.
- **`packages/engine` untouched** — this track never imports engine internals beyond the existing
  `SwapAlternative`/`alternativesForSlot` WorkoutScreen already used; `check:engine-purity` still
  passes because nothing here touches `packages/engine` at all.
- **Existing WorkoutScreen tests still pass unmodified** (`WorkoutScreen.swap/.rest/
  .timedBilateral/.timedUnilateral/.resume.test.tsx`) — confirms wiring `DemoMedia` in didn't
  regress anything Wave 4 built.

### What I deliberately did NOT verify (be explicit, per the review bar)
- **No real device / simulator / Metro bundle / `pod install` run.** This environment has no iOS
  simulator. `react-native-svg` and `react-native-webview` are native modules; Jest cannot load
  either one for real (confirmed by direct probing — recorded in both `__mocks__/*.js` file
  headers), so every test above proves "the right branch mounts, the right callback fires,"
  never "a figure actually rasterizes" or "a YouTube video actually plays." This is the same
  category of gap Wave 4's `workoutAudio.ts`/`workoutNotifications.ts` already carry, not a new
  kind of risk — but it is real and unclosed.
- **Real player errors, real embed playback, real metered-connection detection.** All simulated
  via mocks/jest.mock. Nothing here has seen an actual YouTube IFrame error state or an actual
  iOS network-type transition.
- **Real audio-session interaction under an actual video tap.** The mitigation chosen (mute the
  embed via `mute=1`, see Decisions below) sidesteps rather than proves the interaction is safe
  under `expo-audio`'s `duckOthers` session. This is a deliberate design choice specifically
  because the interaction can't be verified here, not a claim that it's been tested.
- **The "figure one tap away" toggle while an embed is showing** (§11.4: "the embed, with the
  figure one tap away") is not implemented — `DemoMedia` shows either the embed or the figure,
  with no manual switch between them while both are eligible. Real, scoped-out gap: **low
  practical impact today** because `curatedVideoId` is hard-coded `null` at the only call site
  until track 6d wires real remote config, so the embed branch never actually fires in the
  current build regardless. Flagging so 6d/Wave 7 knows this needs a small follow-up, not because
  it's silently missing.
- **"Metered connection with data saver on" is approximated, not detected.** No Expo/RN API
  exposes iOS's system Data Saver / Low Data Mode flag to JS (checked `expo-network`'s
  `NetworkState` type directly — only `type`/`isConnected`/`isInternetReachable`). `metered` is
  approximated as `NetworkStateType.CELLULAR`, unconditionally skipping tier 1 on cellular. This
  is conservative (skips more than the literal spec requires, never less) but is a real detection
  gap, documented in `networkStatus.ts`'s file header.

### Deliberately cut (scope, not oversight)
- No settings UI for a "silent-switch override" specific to video, and no toggle to force-allow
  tier 1 on cellular — matches the existing carried-forward gap (#20, notification quiet-hours
  has the same "no settings screen yet" shape).
- Curated-id lookup is a hard-coded `null` at the WorkoutScreen call site with a comment
  explaining why (6d/remote-config sync isn't built). The ladder itself is fully built and
  correct for whatever value 6d eventually supplies — this is the one deliberate seam.
- The operator-facing `flagged` queue (`video_db.py flagged`, §11.5) is NOT fed by this track's
  local flag counter — that CLI is track 6e, not started. The local demotion rule works fully
  standalone (this track's whole point), but "an operator can see what got flagged" needs 6d
  (sync the count somewhere reachable) + 6e (read it) on top of what's here.

### New dependencies (noted per CLAUDE.md)
- `react-native-svg@15.15.4` — renders the bundled tier-2 figure. Chosen over a second WebView
  because it's a native vector renderer with zero HTML/JS execution and zero audio-session
  surface — the safer, lighter choice for content that ships in the binary and must always work
  offline.
- `react-native-webview@13.16.1` — hosts the tier-1 YouTube nocookie IFrame embed. The only way
  to embed YouTube's official IFrame player in RN; no native "embed a video" Expo module exists.
- `expo-network@~57.0.1` — online/metered connectivity signal for the ladder gate.
All three installed via `npx expo install` (SDK-57-compatible pins), added to `app/package.json`
only (no other workspace needs them).

### Decisions / gotchas (for whoever picks this up next)
- **Tier-1 embed audio is muted by design (`mute=1` on the embed URL).** The hard constraint is
  "must not hijack the audio session." `workoutAudio.ts` already documents Wave 4's mitigation
  (re-assert `duckOthers` at workout start), but that guards the *session shape*, not the instant
  a WebView `<video>` element acquires the iOS audio route the moment a user taps play inside the
  embed — that acquisition happens beneath any JS this app controls, and is real-device-only to
  verify. Muting removes the risk by construction instead of relying on an untestable-here
  interaction. This is a real product decision (silent demo video), not free — worth revisiting
  once someone can actually test on a device whether unmuted + reasserting the session is safe.
- **Two-report demotion shares one counter between user reports and automatic player-error
  flags.** The spec states the "two reports" rule for user taps and separately says a player
  error is "reported back as an automatic flag," without saying whether they share a threshold.
  Chose to share it — the more conservative reading (falls back to the safe tier-2 floor sooner)
  and avoids two parallel counters for what the UI shows as one "flagged" state. `source` is
  still recorded per flag for whenever an operator view exists.
- **`video_flag_count`/`video_demoted_at` live on `exercise_state`**, not a new table — it's
  exactly the "per user × exercise, local" shape that table already has the ensure-row pattern
  for. Kept off the shared library table per invariant 7 (same as everything else in that table).
- Nothing in this track can be exercised end-to-end with a real curated id — remote config
  (Firestore `video/{exercise_id}`) is track 6d's job and hasn't started. `curatedVideoId` is
  plumbed as an explicit, well-documented `null` at the one call site specifically so 6d only
  needs to supply a real value there, never restructure anything in `mediaLadder.ts` or
  `DemoMedia.tsx`.

### Suggested carried-forward issues for the orchestrator to file
1. No real device/simulator verification of this track exists (same class as Wave 4/4b/5's #16/
   #22) — roll into Wave 7's acceptance pass, with explicit checks for: figure actually renders,
   an actual curated embed plays muted with no fullscreen/autoplay, a real player error visibly
   falls back with no flash of a broken player, and the workout/rest timers provably don't drift
   while a video is open.
2. iOS Data Saver / Low Data Mode has no JS-visible flag in the current stack; "metered" is a
   cellular-type proxy, not the literal spec behavior. Acceptable conservative approximation for
   v1; flag for whoever eventually finds or builds a way to read the real setting.
3. The embed-vs-figure "one tap away" toggle (§11.4) isn't implemented — low priority today since
   `curatedVideoId` is `null` everywhere until 6d exists, but a real gap once it doesn't.
4. This track's local video-flag state (`exercise_state.video_flag_count`/`video_demoted_at`) has
   no path to the operator yet — needs 6d (sync it somewhere reachable) and 6e
   (`video_db.py flagged` reads it) to close the "loop closes on user flags" §11.5 requirement.
