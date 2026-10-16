## Track: 33 — accessory band memory
Last updated: 2026-10-16
### Done
- (nothing committed yet)
### In progress
- Root cause found: exercises with no `progression_family` (72 of 137 band exercises, e.g.
  `single-arm-curl`) are prescribed by `prescribeAccessory`, which always takes the lightest
  authored band. Nothing remembers the band the user actually trained with for them — progression
  state (and `reconcileMicroToObservedBand`) only exists per family.
- Fix: `exercise_state.working_band` (migration 0027, backfilled from history) written at
  completion for every main entry; engine `ExerciseState.workingBand` read by `prescribeAccessory`
  (pipeline + Approval's Add exercise) in place of the lightest authored band.
### Next
- engine: `workingBand` on ExerciseState + prescribeAccessory input + pipeline wiring, tests
- store: migration 0027 + schema + rowToState + recordExercisePerformed + completion, tests
- app: ApprovalScreen Add exercise passes the stored working band
### Decisions / gotchas
- The band carried forward is the band of the **final completed main set** (`bandActual ?? entry.band`),
  not the family path's `dominantBand`: a user who bumps the band up on set 3 of 3 has told us where
  they belong, and a dominant tally would discard it.
- NOT clamped to the authored range: the user's B3 on a B1-B2 record is what they chose and rated
  "just right". The family path still clamps (unchanged).
- Recovery (48h) band-drop still applies on top of the remembered band.
- Warm-up/cool-down entries never write it (their band is deliberately below working load).
- The worktree had uncommitted Track 32 (best-set stats) changes when this started — never stage
  them with this track's commits.
