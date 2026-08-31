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

### Next (ordered)
1. §10.5 timed-exercise interaction test (issue #18) — not started.
2. Re-run `expo run:ios`, capture evidence of the WORKING loop (not just bugs) into
   `docs/handoff/evidence/` — including, this time, real confirmation that audio/haptics/the
   background notification actually work on-device, not just that they don't throw in Jest.

### Decisions / gotchas
- `packages/engine` was flagged as owned by a concurrent track (`2b-timefit-slots`) in the prior
  STATUS file, but ORCHESTRATION.md shows that track closed (issue #7, "closed — track
  2b-timefit-slots"). Confirmed via `git log` this repo has one clean history with that work
  already merged, so `packages/engine` is free to edit now.
