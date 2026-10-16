## Track: 33 — accessory band memory

Last updated: 2026-10-16

### Done

- [x] engine: `ExerciseState.workingBand`, `prescribeAccessory({ workingBand })`, pipeline wiring,
      tests; regression test that a B3 on Banded Lat Pull Hold (bodyweight-anchored rung) comes back
      B2 (cf1265a)
- [x] store: migration `0027_working_band.sql` (backfilled from history), schema, `rowToState`,
      `recordExercisePerformed({ workingBand })`, completion passes the final completed main set's
      band; tests (b0551e5)
- [x] app: Approval's Add exercise prescribes at the stored working band; test. BACKLOG: removed the
      stale "frozen band at a bodyweight-anchored rung" item (the tier projection fixed it; the
      regression test above pins it), parked "accessories have band memory but no progression".

### In progress

- nothing — track complete. Jest-verified only; a device check is just: move an accessory's band
  up mid-workout, finish, generate again.

### Background

- Root cause: exercises with no `progression_family` (72 of 137 band exercises, e.g.
  `single-arm-curl`) are prescribed by `prescribeAccessory`, which always took the lightest
  authored band. Nothing remembered the band the user actually trained with for them — progression
  state (and `reconcileMicroToObservedBand`) only exists per family.

### Decisions / gotchas

- The band carried forward is the band of the **final completed main set** (`bandActual ?? entry.band`),
  not the family path's `dominantBand`: a user who bumps the band up on set 3 of 3 has told us where
  they belong, and a dominant tally would discard it.
- NOT clamped to the authored range: the user's B3 on a B1-B2 record is what they chose and rated
  "just right". The family path still clamps (unchanged) — so a family exercise logged above its
  range comes back at the top of the range, not the band logged.
- Recovery (48h) band-drop still applies on top of the remembered band.
- Warm-up/cool-down entries never write it (their band is deliberately below working load).
- Mid-workout swap (`buildSwapReplacementEntry`) still carries the replaced entry's band, not the
  replacement's working band — deliberate, untouched.
- `exercise_state` syncs whole rows, so `working_band` syncs with no sync-code change.
