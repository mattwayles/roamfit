## Track: 9-ladder-variety — Sibling exercises per ladder level + accessory rotation
Last updated: 2026-09-01

Origin: user report — a 30-minute full-body workout always contains the same five main
exercises (`goblet-squat, rdl, bw-knee-push-up, seated-row, bw-plank`), and the one accessory
slot is always a curl. Root cause and design in `docs/decisions/0010-sibling-exercises-per-ladder-level.md`.

User decisions already made (do not re-litigate):
- **Anchored siblings**, not strict. Siblings share `metric`; band ranges and equipment may
  differ; `micro.band` is clamped into the chosen sibling's range at prescription time.
- **Author new exercises** to fill the `vertical_push` / `vertical_pull` / `squat.l3` gaps rather
  than accept those levels staying single or promoting `tier: fill` conditioning moves.

### Done
- [x] Root cause confirmed empirically (5 of 6 full-body main slots bypass `selectMain` entirely;
      `expandOptionalSlots` restarts its cycle at index 0 every call).
- [x] ADR 0010 written.

### In progress
- Increment 2: mechanical schema migration. `ProgressionFamilyLevel.exercise_id` →
  `anchor_exercise_id`, plus `exercise_ids: string[]` seeded with `[anchor]` only. Update
  `packages/data/src/schema.ts`, `validate.ts`, `library/families.json`, and every TS call site
  the rename breaks (ladder.ts, rules.ts, calibration.ts, comeback.ts, resolveSlot.ts,
  app/src/lib/celebration.ts, packages/store/src/repositories/progressionState.ts, tests).
  **No behavior change in this increment** — golden snapshots must not move.

### Next
1. Increment 3 — engine: `exercisesForLevel`, sibling-aware `resolveLadderSlot` (RNG pick among
   hard-filter-eligible siblings), band clamp in the prescription stage. Bump `ENGINE_VERSION`,
   regenerate golden snapshots.
2. Increment 4 — `expandOptionalSlots` history-derived starting offset. Tests.
3. Increment 5 — populate `exercise_ids` from existing `tier: core` exercises for hinge,
   horizontal_push, anti_extension, lunge, horizontal_pull, squat (upper levels only).
4. Increment 6 — author new exercises for `vertical_push`, `vertical_pull`, and `squat` at the
   calibration-start level; wire them in as siblings.

### Decisions / gotchas
- **Invariant 5 is not at risk.** `level_id` is unchanged; only the exercises inside a level
  change. No stored state names an exercise, so no migration and no user's progression resets.
- Micro-progression math must ALWAYS use `anchor_exercise_id`, never the sibling that was
  actually programmed — otherwise whether a user can advance depends on an RNG draw. This is the
  single most important rule in this track.
- `validate.ts` has a bidirectional check: every exercise with a `progression_family` must appear
  in exactly one level, and its `progression_level_id` must match. Adding siblings means those
  exercises gain `progression_family` / `progression_level_id` — expect validator churn.
- Library inventory of spare `role: main, tier: core` exercises per pattern, measured 2026-09-01:
  hinge 9, horizontal_push 8, anti_extension 8, lunge 5, horizontal_pull 2, squat 2 (both `hard`),
  vertical_push 0, vertical_pull 0.
- `tier: fill` exercises (burpee, wall-sit, jumping-jack, thruster, squat-to-press) are
  deliberately NOT eligible as siblings — they are conditioning finishers, not strength rungs.
- The accessory offset is a history-derived rotation, not an RNG draw: `expandOptionalSlots` runs
  before the RNG is available in template building, and rotation gives better coverage anyway.
