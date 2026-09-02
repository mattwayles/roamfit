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
      `expandOptionalSlots` restarted its cycle at index 0 every call).
- [x] ADR 0010 written — `f1c6640`.
- [x] Schema migration, no behavior change — `7d4990a`. `exercise_id` → `anchor_exercise_id` +
      `exercise_ids[]`; validator gains the ADR 0010 integrity rules.
- [x] Engine: sibling-aware `resolveLadderSlot` + prescription band clamp — `2c8c04c`.
      `ENGINE_VERSION` 2.3.1 → 2.4.0.
- [x] Accessory rotation in `expandOptionalSlots` — `2302836`.
- [x] 35 sibling assignments from existing `tier: core` library entries — `43fd232`.
- [x] 14 new exercises for the levels the library could not cover.

### In progress
- Nothing. The track is complete and `npm run check` is green.

### Next
- **Device verification is outstanding.** Everything here is verified by unit/golden tests and by
  a scripted probe against the real library; none of it has been seen on a device. That belongs
  with the Wave 7 acceptance gate.
- Optional follow-ups, none blocking:
  - The knee-dominant full-body slot now alternates squat <-> lunge. `legs` sessions still give
    squat, hinge and lunge a slot each, so the lunge family is no longer full-body-starved.
    `hinge` deliberately does NOT alternate — it is the only hip-hinge family there is.
  - `horizontal_push` l7–l9 and `horizontal_pull` l4–l8 still have no siblings. They are high
    rungs no current user occupies; fill them when someone gets there.
  - `anti_extension` l4 and l6 (banded, timed, hard) have no siblings — the library has one
    other timed band anti-extension exercise and it went to l7.
  - `vertical_push.l4` (`bw-dip`) and `vertical_pull.l1` (`bw-dead-hang`) are anchored on
    `body-support` / `pullup-bar`, which are NOT default-available, so they are hard-filtered for
    most users. `bw-low-bar-hang` now covers l1; l4 is covered by `banded-push-press`. Worth
    revisiting whether those anchors belong on a rung at all.

### Decisions / gotchas
- **Invariant 5 is not at risk.** `level_id` is unchanged; only the exercises inside a level
  change. No stored state names an exercise, so no migration and no user's progression resets.
- Micro-progression math must ALWAYS use `anchor_exercise_id`, never the sibling that was
  actually programmed — otherwise whether a user can advance depends on an RNG draw. This is the
  single most important rule in this track. `exerciseForLevel()` returns the anchor and is the
  right default; `exercisesForLevel()` is the one that returns the set.
- `resolveLadderSlot` prefers a sibling NOT programmed in the most recent non-discarded session,
  falling back to the full eligible set. That is what makes consecutive sessions differ rather
  than merely being random.
- Two authoring scripts are committed under `packages/data/scripts/` and are idempotent:
  `apply_siblings.js` (reuse existing exercises) and `add_sibling_exercises.js` (the 14 new
  records). Re-run either after editing its map rather than hand-editing the JSON.
- `tier: fill` exercises (burpee, wall-sit, jumping-jack, thruster, squat-to-press) are
  deliberately NOT eligible as siblings — the validator now rejects them outright.
- **Tests that ran the same seed twice and compared sessions are now invalid by construction.**
  `packages/store/src/testFixtures.ts` exports `singleExerciseFamilies` (every level trimmed to
  its anchor) for tests whose subject is session-to-session *state* — best-set PRs, level
  transitions. `completion.test.ts` uses it. Do not "fix" such a test by re-pinning exercise ids.
- `lowBarAnchor.test.ts` is an ADR 0007 tripwire pinning exactly which `bodyweight_bearing`
  exercises are default-available. `bw-low-bar-hang` was added to it deliberately. Anything on
  `pullup-bar` or `body-support` joining that list is a bug.
- Measured on a cold-start 30-minute full-body session, 25 regenerations: **4 distinct main
  blocks before** (differing only in which curl), **25 distinct after**.
