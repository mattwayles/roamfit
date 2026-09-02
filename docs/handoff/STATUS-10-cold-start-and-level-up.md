## Track: 10-cold-start-and-level-up — Level-1 cold start + user-driven "too easy"
Last updated: 2026-09-01

Origin: user rejected the §6.5 30th-percentile cold start ("it defeats the purpose of
progressing") and asked for a way to mark a laddered exercise too easy and unlock the next level.
Design in `docs/decisions/0012-level-1-cold-start-and-user-level-up.md`.

User decisions already made (do not re-litigate):
- Control lives at **both** approval and mid-workout, applying immediately to the current session.
- **Repeatable, one rung per tap** — not a level picker.
- **Reset existing progression state** to level 1 via migration.

### Done
- [x] `calibrationStartLevel` returns `levels[0]`; `CALIBRATION_START_PERCENTILE` deleted.
- [x] `levelUpForTooEasy` in `progression/rules.ts`, with tests. `ENGINE_VERSION` 2.4.0 → 2.5.0.
- [x] `banded-lat-pull-hold` authored — `vertical_pull.l1` was bar-only and would have been a
      permanent PATTERN GAP for a user with no bar.
- [x] `packages/store/src/levelUp.ts` (`levelUpEntry`) + `level_up_too_easy` signal type.
- [x] Migration `0009_reset_progression_to_level_1.sql` (+ matching TS constant — `migrate.test.ts`
      enforces byte-for-byte sync between the two).
- [x] Approval screen control (`level-up-<exerciseId>`) and mid-workout control (`level-up-set`),
      both with dedicated screen tests driven through the real screens and the real store.

### In progress
- Nothing. `npm run check` is green.

### Next
- **Device verification is outstanding**, and matters more here than usual: migration 0009 runs
  destructively against a real database on first launch after this ships, and no automated test
  exercises a *populated* pre-0009 database. Verify on device that (a) progression re-seeds at
  level 1, (b) exercise_state survives, (c) the two controls behave.
- Consider feeding `level_up_too_easy` signals back into the cold start once there is real data —
  the ADR flags this as the reason the signal carries both rungs.

### Decisions / gotchas
- **Level-up is NOT a swap.** A swap increments `swapAwayCount`, which feeds §5.2's
  REPEATEDLY-SKIPPED suppression; a level-up must not, because the user has no complaint about
  the exercise. Pinned by a test in `levelUp.test.ts`.
- **`levelUpEntry` resolves the new rung BEFORE committing the level change** and rejects a
  resolution that walked back down (`no_eligible_exercise`). Do not "simplify" this into commit-
  then-resolve: it would strand a user on a rung they cannot perform.
- **`levelUpForTooEasy` preserves `calibrating`.** Ending calibration early on a manual level-up
  would strand a user who overshoots, since calibration is the thing that can drop them back.
- Migration 0009 DELETEs rather than UPDATEs; `ensureProgressionStatesInitialized` re-seeds from
  the engine. Never hardcode `"<family>.l1"` into SQL — it duplicates ladder structure where it
  can drift from `families.json`.
- `pipeline.test`'s "no bodyweight_bearing for a default user" assertion was wrong, not the code —
  ADR 0007 made `low-bar` default-available on purpose. It now pins the real rule (available
  anchor + §13.1 effort cap applied). Do not revert it to the blanket assertion.
- Starting at level 1 means **every new user's first session is genuinely easy** (wall push-ups,
  dead bugs, bw-squat). That is intended, and the level-up control is the whole mitigation. If
  first-session drop-off shows up in the §15 instrumentation, the fix is a better onboarding
  prompt or an auto-calibration widening — not quietly reintroducing a percentile seed.
