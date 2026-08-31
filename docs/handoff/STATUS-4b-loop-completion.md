## Track: 4b-loop-completion — Wave 4 closeout
Last updated: 2026-08-31

### Read before starting
CLAUDE.md, wave-04-workout-loop.md, STATUS-4-loop.md, ORCHESTRATION.md carried-forward #14-18,
ADRs 0003/0004/0005, spec §10.3/§10.5/§10.6/§10.7/§10.8.

### In progress
- **Next action**: issue #14 (`WorkoutScreen.rest.test.tsx` waitFor flake under concurrent CPU
  load) — not started this increment. After that: #17 (approval editing), #18 (timed-exercise
  interaction test), then the `expo run:ios` evidence pass.

### Done
- [x] **Issue #15 closed** — §10.6 mid-workout swap, engine through UI:
  - `packages/engine/src/selection/swap.ts` — `alternativesForSlot(req)` and
    `buildSwapReplacementEntry(exercise, entry)`, exported from `packages/engine/src/index.ts`.
    Reuses `applyHardFilters`/`effortCapForExercise` verbatim (no reimplementation of
    §13.1/§13.2), filters to the same `pattern`, excludes suppressed exercises, ranks by
    difficulty-distance to the replaced exercise (the "same progression level" approximation — a
    laddered family has exactly one exercise per level, so true level-matching across exercises
    isn't meaningful; difficulty-band matching is the closest defensible proxy, documented in the
    file header). Supports the "different anchor" quick-filter (`excludeAnchor`). 14 tests in
    `packages/engine/src/selection/swap.test.ts`.
  - `packages/store/src/repositories/sessions.ts`'s `recordSwap` extended to take the engine's
    full replacement prescription (band/sets/reps/duration/rest/tempo/pattern/anchorClass/
    effort/progression fields), not just a new `exerciseId` — the old signature would have left a
    stale rep/duration shape on the entry when the new exercise has a different metric or
    equipment. Updated `lifecycle.test.ts`'s existing swap test for the new signature.
  - `app/src/components/SwapSheet.tsx` (new, pure presentation) + `WorkoutScreen.tsx` wiring: a
    Swap button on both `RepsExercise` and `TimedExercise` opens the sheet; picking an
    alternative calls `sessionsRepo.recordSwap` and reloads, no re-approval/regeneration route,
    session stopwatch (a ref) untouched. `app/src/screens/WorkoutScreen.swap.test.tsx` drives
    this through the real screen (not mocked) — real `alternativesForSlot` candidates, real
    `recordSwap`, asserts `plannedExerciseId` stays original while `exerciseId` changes, and
    `swapAwayCount` increments (§5.2 REPEATEDLY-SKIPPED input).
  - **Bug caught while wiring**: `useMemo` was placed after the screen's early-return loading
    states, so mounting past those states changed the hook count between renders ("Rendered more
    hooks than during the previous render" — real, reproduced by the existing rest-timer test
    suite going red). Fixed by hoisting all hooks above every early return and having them guard
    internally on `current`/`entry` being present instead. This is exactly the class of bug
    `npm run check`'s type/lint layer does NOT catch — only running the actual test suite did.
  - `npm run check` green throughout (engine 870, store 32, data 2, app 12).

- [x] **Issue #16 closed (Jest-verifiable portion)** — §10.8 audio, haptics, background rest timer:
  - Added `expo-audio@57.0.4`, `expo-haptics@57.0.2`, `expo-notifications@57.0.15` to
    `app/package.json`; `app/app.json` gained the `expo-audio`/`expo-notifications` plugins and
    `ios.infoPlist.UIBackgroundModes: ["audio"]` (required for the rest timer to keep making sound
    backgrounded).
  - **Real gotcha found and isolated**: `expo-audio`'s top-level class throws on import with no
    native module registered (confirmed by probing it directly) — unlike `expo-haptics`/
    `expo-notifications`, which both no-op safely under Jest. `app/src/lib/workoutAudio.ts`
    isolates the `expo-audio` import behind a lazy `require` wrapped in try/catch, so any file
    that imports it (including screens Jest exercises directly) stays importable. Documented at
    length in that file's header — this is a real Jest-vs-device gap, not a workaround to gloss
    over.
  - `app/src/lib/workoutAudio.ts` — `configureWorkoutAudioSession(silentSwitchOverride)`
    (duckOthers, background-capable, respects the silent switch by default) + five cue helpers
    (`cueCount`/`cueHalfway`/`cueStart`/`cueCompletion`/`cueRestZero`) that always pair a real
    tone (four generated WAV assets in `app/assets/audio/`) with a haptic, so audio and haptics
    can never drift apart at a call site (§10.8: haptics carry the same info when muted).
  - `app/src/lib/workoutNotifications.ts` — schedule/cancel a local "rest complete" notification,
    foreground-suppressed (the screen already shows the countdown + plays its own cue).
  - Wired into `WorkoutScreen.tsx`: `TimedExercise` now fires the count-in (3-2-1 on the
    get-ready), a start haptic, a halfway chime only over 45s, a count-out (3-2-1 before
    completion), and a distinct completion tone+haptic — all via refs so each fires exactly once
    per set regardless of render count. `RestPhase` fires the 3-2-1 + zero cue, and now also
    schedules/reschedules/cancels the background notification around `+15s`/`-15s`/Skip/Next/
    unmount. `+15s` now also records the §8.3 fatigue signal via a corrected `logSet` upsert
    (reads the just-logged set-log row back and resubmits it whole with `restExtendedCount`
    bumped, targeting `restingEntryId`/`restingSetIndex` captured before `reload()` — the same
    "which entry does this apply to" bug class already documented for §8.1 feedback).
  - `npm run check` green throughout (engine 870, store 32, data 2, app 20 across 8 suites).
  - **What is NOT verified**: none of this has run on a real device/simulator yet. Every test
    above proves "the right calls happen with the right arguments, nothing throws" — not that a
    tone is audible, ducks correctly, respects the physical silent switch, or that a background
    notification actually appears. That is real device-only evidence and is still owed (see Next).
  - **Known scope cut, recorded rather than silently skipped**: no persisted "silent switch
    override" user setting exists (no settings screen in this track's scope) —
    `configureWorkoutAudioSession` is called with a hardcoded `false` (respect the silent switch),
    which is the spec-compliant default; wiring a real toggle is future work.

- [x] **Issue #14 closed** — `WorkoutScreen.rest.test.tsx`'s flake root cause (confirmed, not
  guessed): `RestPhase`/`TimedExercise`'s displayed countdown only updates on their own internal
  250ms `setInterval` re-render tick (`useCountdown.ts`'s `forceTick`) — pressing `+15s`/`-15s`
  mutates the wall-clock controller synchronously, but the *screen* doesn't reflect it until that
  next tick. Under real CPU contention the event loop can starve past the default `waitFor`
  budget (1000ms, 50ms poll) before that tick fires, timing the assertion out even though the
  underlying state was already correct — a real "wait budget sized for an idle CPU," not db
  contention (per-worker db naming already fixed that in the prior track). Fixed: a shared
  `WAIT_OPTS = { timeout: 5000, interval: 50 }` applied to all 10 `waitFor` calls in the file —
  still polling the same real assertions (not a fixed sleep), just with headroom over the 250ms
  tick under load. **Verified, not assumed**: ran the target test 3x solo, then 2x concurrently,
  both while pinning all CPU cores at 100% with `yes > /dev/null` background processes (one per
  core) — all passed, where the prior version was reported to fail under exactly this shape of
  load.

- [x] **Issue #17 closed** — §10.3 approval-time editing, engine through UI:
  - `packages/engine`: exported `applyHardFilters`, `effortCapForExercise`, and
    `prescribeWarmupCooldown` (alongside the already-exported `prescribeAccessory`) so "add
    exercise" candidates and their prescriptions come entirely from the engine, never invented in
    `app/`.
  - `packages/store`: `addEntryAtApproval`/`adjustRepTargetAtApproval` (see the `bdc1e19` commit
    for the store/schema half — done in the previous increment).
  - `app/src/screens/ApprovalScreen.tsx`: an "+ Add exercise" affordance per section opens an
    inline picker (candidates from `applyHardFilters`, excluding exercises already in the plan);
    picking one prescribes via `prescribeAccessory`/`prescribeWarmupCooldown` and persists via
    `addEntryAtApproval`. Rep-target `+`/`-` steppers appear next to any entry with a rep target
    and call `adjustRepTargetAtApproval`. The live time estimate needed **no new code** — it was
    already a pure `reduce` over `session.entries`, so it updates for free on the next `reload()`
    after any edit (add/remove/adjust-sets/adjust-rep-target all trigger one).
  - New `app/src/screens/ApprovalScreen.test.tsx` — first dedicated interaction test for this
    screen (previously only exercised indirectly per the prior STATUS file). Drives add-exercise,
    rep-target edit, adjust-sets, and remove through the real screen against the real store, and
    asserts the live estimate text actually changes after adding an exercise.
  - `npm run check` green (engine 870, store 34, data 2, app 21 across 9 suites).

- [x] **Issue #18 closed, and it caught two real bugs in `TimedExercise` along the way** — this
  screen previously had NO interaction test; both `WorkoutScreen.rest.test.tsx` and
  `.resume.test.tsx` deliberately fast-forward past timed entries to reach a reps entry.
  - New `app/src/screens/timedTestHelpers.ts` (shared, non-test-glob setup) +
    `WorkoutScreen.timedBilateral.test.tsx` / `WorkoutScreen.timedUnilateral.test.tsx` (split into
    two files — see below). Both patch the target entry's `durationSec`/`unilateral` directly on
    the row after a real `generate()` call so the test only has to wait out a short, controlled
    duration rather than whatever the generator picked, while everything else about the row
    (schema, driver) is real.
  - **Bilateral**: tap-to-start never auto-starts, 3s get-ready counts in, Pause freezes the
    displayed remaining time, Resume un-freezes it, End Early records `secondsActual < prescribed`
    and `pauseCount >= 1` on the real `set_logs` row.
  - **Unilateral**: two sequential timers with a switch-side interval between them, auto-advancing
    through both sides with no user input beyond the initial tap, `secondsActual` on completion is
    the **sum of both sides** (4s for two 2s sides — never just one side's 2s, never 0).
  - **Real bug #1 (found by the pause assertion going red under real timing, not the swap/rest
    suites' more forgiving happy paths)**: the original chained-`useEffect` implementation
    determined "has this side started yet" via `!controller.isRunning()`, but
    `CountdownController.isRunning()` (`wallClockTimer.ts`) is `running && !paused` — **true while
    genuinely paused, indistinguishable from "never started."** Every ~100ms tick after a real
    pause, the phase engine saw `isRunning() === false` and called `.controller.start()` again,
    which silently **un-paused AND reset the timer to full duration**. Fixed with explicit
    `side1StartedRef`/`side2StartedRef` booleans instead of inferring "started" from `isRunning()`.
  - **Real bug #2, more serious (found by the unilateral test getting permanently stuck at `0`
    under real CPU contention — reproduced by running the two timed test files together, see
    below)**: the original implementation chained multiple `useEffect`s off each `useCountdown`
    hook's own **snapshot** `isComplete` value, relying entirely on each hook's own independent
    250ms `forceTick`/AppState-driven re-render to ever notice a transition. Under load this
    starved long enough that a side's completion was never observed, and the exercise hung forever
    with no way forward — a real correctness bug, not a slow test. **Rewrote the whole phase
    machine (get-ready -> side 1 -> [switch interval -> side 2] -> complete) as one 100ms
    `setInterval` that reads `.controller.remainingMs()`/`.isComplete()` directly** every tick,
    independent of React's render scheduling. (This introduced its own stale-closure risk — the
    interval is created once per `started` lifetime and closes over `sideIndex`/`switching` — fixed
    with ref mirrors (`sideIndexRef`/`switchingRef`) updated in lockstep with the state setters, so
    the interval always reads the current phase while state still drives re-renders for the JSX.)
  - Split into two test files (`timedTestHelpers.ts`'s header explains why) after the two `it`s in
    one file were observed to occasionally interfere with each other's real-timer assertions when
    run back to back — separate Jest module registries removed that. **Verified stable**: 3x solo
    each, 4x combined, and once combined while pinning all CPU cores at 100% (`yes > /dev/null`
    per core) — all passed, and materially *faster* than the buggy chained-effects version (the
    unilateral test dropped from routinely needing >30s/timing out to a consistent ~13s).
  - Also added a `testID="timed-remaining"` on the countdown's own `<Text>` (previously only the
    wrapping `<View>` had a testID) — needed to read the *primitive* rendered value in a test
    rather than comparing two separately-queried React elements with `toEqual` (unreliable:
    they can carry different internal fiber metadata across renders even with identical visible
    text — a real false-failure this surfaced, unrelated to the two bugs above).
  - `npm run check` green (engine 870, store 34, data 2, app 23 across 11 suites). **Runtime note**:
    full `npm run check` is now ~20-25s (up from the ~13s CLAUDE.md/prior status files cite) —
    entirely accounted for by these two new real-wall-clock timed tests (~5s + ~13s). Not a
    regression in db isolation or a hang; if it starts taking materially longer than ~30s, that
    would be worth investigating, but this shift is expected and documented here per CLAUDE.md's
    instruction to flag exactly this.

- [x] **Issue #14 re-diagnosed and actually closed.** My first pass (generous `waitFor` timeouts)
  was insufficient — the orchestrator independently re-tested with two truly concurrent
  `npx jest` processes in `app/` and found 2-5 failures on every run, plus a smoking-gun error the
  raised timeout let surface: `ReferenceError: You are trying to 'require' a file after the Jest
  environment has been torn down`, from `WorkoutScreen.rest`/`timedBilateral`/`timedUnilateral`
  (later reproduced independently here, isolated further to `WorkoutScreen.swap.test.tsx` and
  `.resume.test.tsx` as the most consistent failures — both predate this track's `WAIT_OPTS` fix,
  never having received it).
  - **Root cause, found and confirmed, not assumed**: `expo-notifications`'s own package code has
    a **module-import-time side effect** — `DevicePushTokenAutoRegistration.fx.ts` (pulled in by
    the package's own `index.ts`) calls `addPushTokenListener` the instant the module is
    `require`d, starting a background async push-token registration/listener chain that this
    app's code never asked for and has no handle to cancel. Under real contention (two Jest
    processes competing for the CPU), that chain can still be in flight when Jest tears down a
    test *file's* module registry at the end of its run — its next continuation's module lookup
    then throws exactly the "torn down" error. The (unrelated-looking) "unable to find element"
    failures in the same runs are the same starvation from the other side: real CPU contention
    slowing the whole render/db pipeline past the wait budget.
  - **I did audit whether this is instead a WorkoutScreen lifecycle bug**, per the request, before
    concluding it isn't: every async path in `WorkoutScreen.tsx`/`RestPhase` was checked.
    `RestPhase`'s `scheduleRestZeroNotification(...).then(id => { if (!cancelled) ... })` already
    guards its only post-await state write with a `cancelled` flag set in the effect's own cleanup
    (existing code, not new this pass). Every `setInterval` is cleared via standard `useEffect`
    cleanup, which React runs synchronously on unmount — since JS is single-threaded, a tick
    already in progress always completes before cleanup can run, so there is no "interval fires
    after unmount" race possible in this codebase. `handleExtend`/`handleSkip`/`handleNext` write
    to a `ref` (not React state) after an `await`, which is inert-if-unmounted by construction (no
    React warning, no crash). **Conclusion: this is a third-party import-time side effect leaking
    into the test harness, not an app-code unmount/cancellation bug** — recorded explicitly per
    the request to say so if that's what the evidence shows, backed by the audit above and the fix
    below actually closing the flake.
  - **Fix**: `app/__mocks__/expo-notifications.js`, a Jest manual mock (Jest's own convention: a
    file at `<rootDir>/__mocks__/<node_modules package>.js` replaces that package in every test
    file automatically, no per-file `jest.mock()` needed) that mirrors the exact surface
    `workoutNotifications.ts` calls, all no-op/instant — removing the background side effect at
    its source under Jest, while changing nothing about the real package's behavior on-device.
    Confirmed the push-token console.warn that was the visible symptom of the same side effect
    disappeared after adding it.
  - Also brought `WorkoutScreen.swap.test.tsx`/`.resume.test.tsx` up to the same `WAIT_OPTS`
    (5000ms/50ms poll) standard as `.rest.test.tsx` — defense in depth, not the fix itself.
  - **Verified the way requested, not with a single green run**: two concurrent `npx jest`
    invocations in `app/`, run **6 times** across two separate sessions of testing (3 before this
    status update, 3 more after the final `WAIT_OPTS` consistency pass) — **zero failures across
    all 12 processes**, zero "torn down" errors, where the un-fixed baseline failed every single
    time. `npm run check` (single-process) remains green throughout (engine 870, store 34,
    data 2, app 23/11 suites).

### In progress (this increment)
All five brief items (#14-#18) are now closed at the Jest/store/engine level, verified by
`npm run check` green AND by the concurrency re-verification above. Last remaining step: a real
`expo run:ios` pass with evidence of the WORKING loop. `pod install` re-run to pick up the three
new native deps (expo-audio, expo-haptics, expo-notifications) — succeeded, 101 pods.
`expo run:ios --device "iPhone 17 Pro"` — build succeeded, app installed and launched
successfully against a live Metro bundler (`expo start --dev-client --port 8082`), confirming the
new native modules link and the app boots with no red screen. Home screen renders correctly on
device with the new deps present (screenshot in progress — see Next for what's still owed).

### `expo run:ios` evidence — what's real device-verified vs. still Jest-only
- [x] `pod install` picked up the three new native deps (ExpoAudio 57.0.4, ExpoHaptics 57.0.2,
  ExpoNotifications 57.0.15) cleanly, 101 pods.
- [x] `expo run:ios --device "iPhone 17 Pro"` — **Build Succeeded**, installed, and launched
  against a live Metro (`expo start --dev-client --port 8082`) with **no red screen** — the app
  boots correctly with the new native modules linked.
  `docs/handoff/evidence/04-home-screen-post-audio-deps.png` — Home screen rendering correctly.
- [x] **A real tap actually worked in this environment**, unlike the prior STATUS file's finding
  (no accessibility permission) — `osascript`/System Events IS permitted here.
  `docs/handoff/evidence/05-real-tap-home-to-generate.png` — tapping the "Generate a session"
  card for real navigated to the Generate screen, pre-filled with the smart-default pickers
  (30 min / all anchors / full / normal) exactly as §10.2 specifies. This is new: no prior wave-4
  session got a real device tap to register.
- [ ] **Could not get further than that one tap.** Coordinate calibration (Simulator window
  offset + point-vs-pixel scale) turned out to be harder to pin down than expected — several
  follow-up taps aimed at the Generate screen's own "Generate" button and its "hard" effort pill,
  computed with the same formula that produced the one working tap, all landed on dead space
  (screen unchanged, confirmed across 5 attempts with 3 different target elements including the
  unambiguous back-chevron). I did not want to keep spending the remaining session budget on
  trial-and-error coordinate guessing once it stopped being productive — recorded honestly rather
  than papering over it with a screenshot sequence that implies more was verified than was.
  **A future agent**: the one data point that worked was clicking at absolute screen coords
  `(window_x + point_x, window_y + point_y)` where `point_x/y` are derived from a screenshot pixel
  coordinate divided by the device's 3x scale factor — but a second, independent calibration
  point is needed (e.g., deliberately tap two elements whose real point-coordinates can be
  computed from the source `StyleSheet` values, not eyeballed from a screenshot) before trusting
  the transform for a full walkthrough.
- [ ] Approval/Workout/rest-timer/Summary screens, the swap sheet, timed-exercise pause/end-early,
  and the approval add-exercise/rep-target editing are **NOT** re-verified on-device this pass —
  only Jest-verified (see each issue's section above). Same for audio ducking, haptic feel, the
  silent-switch behavior, and the background rest-timer notification actually appearing while
  backgrounded/locked — **none of this is screenshot-verifiable even with working taps**, and
  remains explicitly Jest-only evidence, consistent with every prior status update in this file.

### Decisions / gotchas
- `packages/engine` was flagged as owned by a concurrent track (`2b-timefit-slots`) in the prior
  STATUS file, but ORCHESTRATION.md shows that track closed (issue #7, "closed — track
  2b-timefit-slots"). Confirmed via `git log` this repo has one clean history with that work
  already merged, so `packages/engine` is free to edit now.
