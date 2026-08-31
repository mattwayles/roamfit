## Track: 4b-loop-completion — Wave 4 closeout
Last updated: 2026-08-31

### Read before starting
CLAUDE.md, wave-04-workout-loop.md, STATUS-4-loop.md, ORCHESTRATION.md carried-forward #14-18,
ADRs 0003/0004/0005, spec §10.3/§10.5/§10.6/§10.7/§10.8.

### In progress
- **Next action**: §10.8 audio/haptics/background rest timer (issue #16). Not started yet — will
  need `expo-av`/`expo-audio`, `expo-haptics`, `expo-notifications` as new deps (none currently
  in `app/package.json` — will note versions here once added). Silent-switch respecting audio
  requires an iOS audio session category (`playback` w/ `mixWithOthers`+`duckOthers` options) —
  research the exact Expo API for this before writing code.

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

### Next (ordered)
1. §10.8 audio/haptics/background rest timer (issue #16) — not started.
2. §10.3 approval-time add-exercise / edit-rep-target + store additions (issue #17) — not started.
3. Issue #14 test fragility fix (`WorkoutScreen.rest.test.tsx` waitFor) — not started.
4. §10.5 timed-exercise interaction test (issue #18) — not started.
5. Re-run `expo run:ios`, capture evidence of the WORKING loop (not just bugs) into
   `docs/handoff/evidence/`.

### Decisions / gotchas
- `packages/engine` was flagged as owned by a concurrent track (`2b-timefit-slots`) in the prior
  STATUS file, but ORCHESTRATION.md shows that track closed (issue #7, "closed — track
  2b-timefit-slots"). Confirmed via `git log` this repo has one clean history with that work
  already merged, so `packages/engine` is free to edit now.
