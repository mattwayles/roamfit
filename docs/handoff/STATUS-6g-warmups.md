## Track: 6g-warmups — Shoulder-safe warm-up variety (closes issue #33)
Last updated: 2026-09-01

### Status
Done. `npm run validate:library` and `npm run check` both green. Commit: (see git log after this
status file's own commit — this track lands in one commit alongside itself).

### Measured before/after (against the committed library, not estimated)
- Warmup pool: 9 -> 13 records (`npm run validate:library`'s coverage report: `role: warmup` 13).
- Genuinely shoulder-specific `focus: upper` warmups that survive a `shoulder_overhead`
  limitation (defined as: role=warmup, focus includes upper, no `shoulder_overhead` tag, and
  `primary` includes a shoulder-region muscle — `front_delts`/`rear_delts`/`side_delts`/
  `upper_back`/`traps`/`lats`/`chest`/`biceps`/`triceps` — the same distinction the orchestrator's
  own issue #33 text drew between `wu-pull-apart` and the coincidentally-tagged `wu-cat-cow`/
  `wu-world-greatest`):
  - **Before: 1** (`wu-pull-apart`).
  - **After: 5** (`wu-pull-apart`, `wu-scap-push-up`, `wu-band-external-rotation`, `wu-thread-the-needle`,
    `wu-band-row`).
  - All 5 also survive a `shoulder_horizontal` limitation (not just the required "at least one").
- Verified with a python script mirroring `packages/data/src/index.test.ts`'s filter logic,
  querying the actual committed `packages/data/library/exercises.json`, not the design intent.

### Done
- [x] Read CLAUDE.md, ORCHESTRATION.md (issues #33/#3/#1/#23), contraindications-review.md,
      STATUS-6a-figures.md, spec §4.1/§5.2/§5.5.
- [x] Confirmed HEAD `e2daca4`, tree clean.
- [x] Confirmed current state: 9 warmups, only `wu-pull-apart` is a genuinely shoulder-specific
      survivor of a `shoulder_overhead` limitation with `focus: upper` (measured, see below).
- [x] Read `packages/data/scripts/migrate_library.py` (NEW_EXERCISES pattern to follow),
      `packages/data/src/schema.ts`, `packages/data/src/validate.ts`, `tools/generate-figures.ts`
      archetype/rig system (forward kinematics, ground-contact tolerance in
      `packages/data/src/index.test.ts`: closest drawn point must land with
      `maxY` in `[GROUND-6, GROUND+2]` = `[146,154]` unless allowlisted).
- [x] Designed 4 new warmup records, hand-verified grounding/canvas-bounds math for each new
      figure archetype with a throwaway python forward-kinematics script (matching this rig's
      exact formulas) before touching any code:
      - `wu-scap-push-up` (bodyweight, plank, scapular protraction/retraction, straight arms) —
        new archetype `scap_push_up`.
      - `wu-band-external-rotation` (band, elbows pinned at sides, external rotation) — new archetype
        `band_external_rotation`.
      - `wu-thread-the-needle` (bodyweight, quadruped, thoracic/shoulder rotation) — new
        archetype `thread_needle`, reuses `quadruped_reach`'s verified grounding offset.
      - `wu-band-row` (band, standing, elbow-driven horizontal row) — reuses the existing
        `horizontal_pull` pattern-default archetype, no override needed (same as `door-row`/
        `seated-row`).

### Done (continued)
- [x] Wrote the availability regression test in `packages/data/src/index.test.ts`
      (`describe('warm-up variety for a shoulder_overhead limitation ...')`, 3 `it`s) and ran it
      against the pre-track library **first** — confirmed it fails (`Expected: > 1, Received: 1`)
      before adding any new records. Re-ran after adding the records: passes.
- [x] Added `NEW_WARMUPS` (4 records) to `packages/data/scripts/migrate_library.py`, re-ran it —
      204 exercises written (was 200).
- [x] Added 3 new figure archetypes (`band_external_rotation`, `scap_push_up`, `thread_needle`) plus
      `REUSE_ARCHETYPE` entries to `tools/generate-figures.ts` (`wu-band-row` needed no override —
      it's a standing row, exactly `horizontal_pull`'s own pattern default, same as `door-row`/
      `seated-row`). Regenerated `figures.json` (204 figures, 410.7 KB / 3 MB budget).
- [x] Hand-verified grounding math for each new archetype with a throwaway python
      forward-kinematics script *before* touching the generator, the same method 6a-figures used —
      caught and fixed one real bug this way: `thread_needle`'s first attempt reused
      `quadruped_reach`'s hipOffset verbatim, which grounds *its* arm angles (100/100), not
      `thread_needle`'s different "threaded under" angles (60/60) — landed the hand at y=142.6,
      9.4px outside the test's 6px float tolerance. Fixed by recomputing the offset for this
      archetype's own angles (now grounds at y=149.98). Caught by actually running the jest suite
      after first-pass generation, not assumed from the python script alone.
  - `npm run validate:library`: 0 errors, 204/204 figure coverage.
  - `packages/data`'s jest suite (17 tests, includes the pre-existing ground-contact and
    canvas-bounds regression tests from 6a-figures): all pass, including on the new figures.
- [x] Rendered all 4 new figures with `qlmanage -t -s 700` and looked at each with the Read tool
      against its own `setup` cue:
      - `wu-scap-push-up`: straight line from head through a fixed elbow to hand in both panels
        (confirms no elbow bend — a real scap push-up doesn't bend the elbow), chest height
        visibly lower in the left panel than the right — reads as the scapular
        protraction/retraction the cue describes, in a plank position.
      - `wu-band-external-rotation`: standing figure, forearm sweeping from across the body to out to the
        side at a constant, non-overhead height (band loop drawn at the hand in both panels) —
        matches "elbows pinned at your sides, forearms rotate."
      - `wu-thread-the-needle`: quadruped figure, the moving arm reaches low (near the floor, left
        panel) to high (well above the head, right panel), stationary leg unchanged — reads as
        threading under and rotating open.
      - `wu-band-row`: standing figure at a wall-mounted anchor, arm extended toward the anchor in
        the left panel and pulled back to the ribs in the right panel — a clean standing row.
      - No defects found; no further rounds needed.
- [x] `packages/engine`'s golden snapshot suite failed after regenerating the library (3 tests) —
      expected and documented behavior per `golden.test.ts`'s own header comment ("if a change is
      deliberate, update the snapshot AND bump ENGINE_VERSION"). Bumped `ENGINE_VERSION`
      `2.3.0` -> `2.3.1` (content-only addition, not a pipeline logic change) and ran `jest -u`.
      5 snapshots updated (the `engine_version` field is embedded in every pinned session, so more
      than the 3 originally-failing snapshots needed the update).
- [x] `npm run check`: green across all workspaces (typecheck, lint — 0 warnings after one
      `eslint --fix` for a prettier formatting nit in the new test, test x5 workspaces including
      897 engine tests, `check:engine-purity`).

### Next
None — track complete. Carried-forward items below are for the orchestrator to file, not blockers.

### Decisions / gotchas
- Ground-contact test tolerance direction: `gap = GROUND - maxY` must be in `[-2, 6]`, i.e.
  `maxY` (the largest/deepest y coordinate drawn, across BOTH panels combined) must be in
  `[146, 154]`. It's a whole-figure check, not per-pose — a pose whose arm swings away from the
  floor (e.g. thread-the-needle's "reach up" end pose) is fine as long as the OTHER pose in the
  same SVG has something grounded, since the test scans the concatenated two-panel markup.
  Confirmed this by hand-checking `bird-dog` (reuses `quadruped_reach`): its poseB hand ends up at
  y=57-63 (nowhere near the floor), but poseA's hand at y=148 keeps the whole figure inside
  tolerance, and `bird-dog` is genuinely not on `ELEVATED_ALLOWLIST`.
- New exercises bypass `contra_for()`'s pattern-base contraindication derivation (same as the
  existing `NEW_EXERCISES` list) — contraindications are set explicitly per record. This is
  correct here: `pattern: shoulder_isolation`'s base tag would otherwise force `shoulder_overhead`
  onto every one of these, which is exactly the tag we're trying to genuinely avoid.
- `wu-thread-the-needle`'s pattern is `anti_rotation`, following the precedent already set by
  `cd-thoracic-rotation` (an active rotational mobility drill, also tagged `anti_rotation` despite
  not literally being an anti-rotation exercise) rather than inventing a new bucket.
- The availability test's "genuinely shoulder-specific" definition is muscle-group-based
  (`primary` includes a shoulder-region muscle), not pattern-bucket-based — a pattern-bucket
  definition would have wrongly excluded `wu-thread-the-needle` (pattern `anti_rotation`, a core
  pattern) despite it being genuine shoulder/thoracic prep. The muscle-group set matches the
  orchestrator's own stated reasoning for why `wu-cat-cow`/`wu-world-greatest` don't count
  (primary movers `lower_back`/`hip_flexors`, not a shoulder muscle).

### Cut / not done
- No new exercises added to the cooldown pool (12 records, only 4 tagged `abs` — carried-forward
  issue #3's other half). Out of this track's scope, which was specifically issue #33 (warmups).
- Did not touch `docs/ORCHESTRATION.md` (orchestrator's file, per the brief's hard constraint).

### Carried-forward issues for the orchestrator to file
- None new. Issue #3 (cooldown pool is also thin, only 4/12 tagged `abs`) remains open and is not
  addressed by this track — it was explicitly out of scope (issue #33 is warmups only).
