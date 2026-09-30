## Track: 19 — Cardio add-on
Last updated: 2026-09-29

User request: an optional "Cardio add-on" checkbox on Generate (like Recovery Workout) that
sprinkles cardio exercises through a strength workout, evenly spaced. The existing Cardio focus is
renamed "Cardio Only" and the add-on is disabled while it is selected.

### Done
- (none yet)

### In progress
- Increment 1 (engine): `GenerationRequest.cardioAddOn`; in `pipeline.ts` draw N conditioning
  exercises via a second `selectMain` (focus 'cardio'), prescribe them, reserve their time out of
  the strength budget (added to the `warmupSec` arg of `fitMainEntries`), interleave evenly into
  `fit.main`. Test in `packages/engine/src/cardioAddOn.test.ts`.

### Next
- Increment 2 (UI): Generate label 'Cardio' -> 'Cardio Only', checkbox `cardio-addon-toggle`,
  disabled when focus is cardio, pass `cardioAddOn` in the request. Update GenerateScreen tests.

### Decisions / gotchas
- Working tree was dirty with unrelated uncommitted work (engine selection/timefit/difficulty
  tweaks, WorkoutScreen, store migration 0021) when this track started. Commit ONLY this track's
  files by explicit path; do not `git add -A`.
- Add-on is ignored for Quick Session and for focus 'cardio' (engine guards both).
- Cardio count = clamp(round(targetMinutes / 20), 1, 5).
- Only touches the RNG stream when the flag is on, so golden snapshots are unaffected when off.
