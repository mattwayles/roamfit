## Track: 4b-loop-completion — Wave 4 closeout
Last updated: 2026-08-31

### Read before starting
CLAUDE.md, wave-04-workout-loop.md, STATUS-4-loop.md, ORCHESTRATION.md carried-forward #14-18,
ADRs 0003/0004/0005, spec §10.3/§10.5/§10.6/§10.7/§10.8.

### In progress
- **Just landed**: engine swap export (issue #15), see Done. Verified `npm run check` green.
- **Next action**: wire `alternativesForSlot`/`buildSwapReplacementEntry` into `WorkoutScreen.tsx`
  as a real swap UI (bottom sheet or modal), calling `sessionsRepo.recordSwap` on confirm. Files:
  `app/src/screens/WorkoutScreen.tsx`, need a new `app/src/components/SwapSheet.tsx`. Check
  `packages/store/src/repositories/` for `recordSwap`'s exact signature first.

### Done
- [x] `packages/engine/src/selection/swap.ts` — `alternativesForSlot(req)` and
  `buildSwapReplacementEntry(exercise, entry)`, exported from `packages/engine/src/index.ts`.
  Reuses `applyHardFilters`/`effortCapForExercise` verbatim (no reimplementation of §13.1/§13.2),
  filters to the same `pattern`, excludes suppressed exercises, ranks by difficulty-distance to
  the replaced exercise (the "same progression level" approximation — a laddered family has
  exactly one exercise per level, so true level-matching across exercises isn't meaningful;
  difficulty-band matching is the closest defensible proxy and is documented in the file header).
  Supports the "different anchor" quick-filter (`excludeAnchor`). 14 new tests in
  `packages/engine/src/selection/swap.test.ts`, all passing. `npm run check` green.

### Next (ordered)
1. Wire swap UI into `WorkoutScreen.tsx` (see "In progress" above) — issue #15's remaining half.
2. §10.8 audio/haptics/background rest timer (issue #16) — not started.
3. §10.3 approval-time add-exercise / edit-rep-target + store additions (issue #17) — not started.
4. Issue #14 test fragility fix (`WorkoutScreen.rest.test.tsx` waitFor) — not started.
5. §10.5 timed-exercise interaction test (issue #18) — not started.
6. Re-run `expo run:ios`, capture evidence of the WORKING loop (not just bugs) into
   `docs/handoff/evidence/`.

### Decisions / gotchas
- `packages/engine` was flagged as owned by a concurrent track (`2b-timefit-slots`) in the prior
  STATUS file, but ORCHESTRATION.md shows that track closed (issue #7, "closed — track
  2b-timefit-slots"). Confirmed via `git log` this repo has one clean history with that work
  already merged, so `packages/engine` is free to edit now.
