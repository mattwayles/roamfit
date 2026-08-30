## Track: 1b-content — Exercise library & progression ladders
Last updated: 2026-08-30

### Done
- [x] Read CLAUDE.md, wave-01b-content.md brief, spec.md §4.1/4.2/5.5/6.1/6.2/6.6/13.1/13.2.
- [x] `packages/data/src/schema.ts` — TS types for `Exercise`, `ProgressionFamily`, and the
      library wrapper types. Single source of truth for shape.
- [x] `packages/data/scripts/migrate_library.py` — reads the daily-workout skill's
      `references/exercises.json` **read-only** (never mutated) and writes
      `packages/data/library/exercises.json` + `library/families.json`. Handles: mechanical
      fields (`anchor_class` derived from `anchor`, `demo_media` stub), all judgment fields
      (`role`, `metric`/`default_seconds`, `tier`, `contraindications`, `aliases`), the pattern
      remap for the prototype's non-schema `isolation`/`conditioning`/`warmup`/`cooldown`
      buckets into real §4.1 patterns, the 8 progression ladders (`FAMILY_LEVELS`), and 4 newly
      authored exercise records that fill genuine ladder gaps. Re-running it regenerates both
      library files from scratch — every judgment call and every ladder choice is in this one
      file, in git, for review.
- [x] `packages/data/src/validate.ts` — the hard validator (unknown enums, metric=time needs
      default_seconds, anchor_class agreement, band/equipment pairing, duplicate ids, no bundled
      `video_id`, family/level referential integrity, duplicate/non-unique `level_id`, every
      §5.5 template pattern slot has ≥1 eligible main exercise per focus, every focus has ≥1
      warmup and ≥1 cooldown), plus a coverage report. Run via `node packages/data/src/validate.ts`
      or `npm run validate:library` (wired at repo root and in `packages/data/package.json`).
- [x] `packages/data/src/index.ts` / `index.test.ts` export `exerciseLibrary`, `familyLibrary`,
      and the schema types (replaced the 1a-skeleton placeholder; nothing else 1a scaffolded in
      `packages/data/` was touched).
- [x] All 8 v1 ladders authored (`horizontal_push`, `horizontal_pull`, `vertical_push`,
      `vertical_pull`, `squat`, `hinge`, `lunge`, `anti_extension`), 7-9 levels each, stable
      `level_id`s (`"<family>.lN"`), monotonic easiest → hardest by leverage/load. Exact rungs
      are in `FAMILY_LEVELS` in `migrate_library.py` — see "Ladder design notes" below for the
      per-family reasoning and every judgment call.
- [x] 4 exercises newly authored to fill explicit prototype gaps (all four flagged by the brief
      as "archer/one-arm variants" the prototype lacks):
      - `bw-one-arm-push-up` — top rung of `horizontal_push` (L9 of 9)
      - `banded-archer-row` — top rung of `horizontal_pull` (L8 of 8)
      - `bw-wall-hspu` (wall handstand push-up) — top rung of `vertical_push` (L7 of 7)
      - `bw-archer-pull-up` — top rung of `vertical_pull` (L9 of 9)
      Full setup cues, contraindications, and constructed `video_search` URLs are in the
      `NEW_EXERCISES` list in `migrate_library.py`.
- [x] **`npm run validate:library` exits 0 with zero errors.** Coverage report (from the last
      run, 200 exercises total = 196 ported + 4 authored):
      - By role: `main: 179, warmup: 9, cooldown: 12`
      - By tier: `core: 96, fill: 92, stretch: 12`
      - By anchor_class: `none: 94, band_tension: 91, bodyweight_bearing: 15`
      - By focus: `upper: 74, full: 69, abs: 66, legs: 65`
      - By pattern (all 17 non-empty): horizontal_push 19, vertical_push 7,
        shoulder_isolation 12, vertical_pull 10, horizontal_pull 11, elbow_flexion 4,
        elbow_extension 4, squat 19, lunge 18, hinge 23, hip_extension 3, abduction 7, calf 5,
        anti_rotation 16, flexion 15, anti_extension 24, lateral_flexion 3
      - All 8 families present with 7-9 levels each, all references resolve.
- Commits:
  - `6e5ae14` — schema, migration, validator, tagged 196-exercise library (families stub empty)
  - `29c0e4b` — author the 8 v1 progression ladders + 4 new exercise records

### In progress
- Nothing mid-flight. **This track's stated done-criteria are all met.** What remains is
  optional polish / second-opinion review, listed under Next.

### Next (all optional polish — the brief's done-criteria are satisfied)
1. Get a second opinion on the `contraindications[]` tagging, especially the `core_pressure` /
   `lower_back_extension` tags across the hinge, plank, and hollow-hold families — §13.2 makes
   this the pregnancy hard-filter, so it's the highest-stakes judgment call in this track. See
   "Judgment calls needing review" below for specifics.
2. Consider whether `hamstring-curl` and `tke` deserve a dedicated `knee_flexion`/
   `knee_extension` accessory pattern in a future content pass rather than being folded into
   `hip_extension` (see below) — purely a taxonomy nicety, not a safety or engine-blocking issue.
3. `packages/data/src/validate.ts`'s `TEMPLATE_PATTERNS` map is a best-effort transcription of
   §5.5's prose pattern-slot lists into pattern-slot-per-focus checks. Worth a second read
   against §5.5 once Wave 2 (the engine) is being built against this data, since the engine's
   actual template logic is the real authority — the validator's map exists only to catch a
   totally-empty slot, not to fully encode template priority order.
4. `npm install` has not been run at the repo root as of this track's last commit (no
   `node_modules/ts-jest` etc.) — `npx jest` in `packages/data` fails with
   `Preset ts-jest not found`. This predates 1b's work (1a-skeleton's own stub test hit the same
   thing) and isn't something to fix from this track, but the next agent touching `packages/data`
   should run `npm install` at the root before trusting `npm test` there. `node
   packages/data/src/validate.ts` does not need any install — it runs on Node's built-in TS
   type-stripping (confirmed on Node v26).
5. If a future content pass adds a 9th accessory rung anywhere, remember: append a new
   `level_id`, never renumber existing ones (invariant 5, CLAUDE.md).

### Ladder design notes (for review)
All levels ordered by leverage/load difficulty, not by the prototype's coarse `easy/medium/hard`
difficulty tag (too coarse to order a 7-9 rung ladder on its own).

- **`horizontal_push`** (9): wall → incline → knee → full push-up → banded push-up → diamond →
  decline → archer → **one-arm (authored)**. Mirrors spec §6.1's own example ladder almost
  exactly, with a single banded rung standing in for the spec example's two separate
  "banded B1"/"banded B2" rungs — band-size progression within one rung is already handled by
  micro-progression (§6.2), so a single `banded-push-up` level (with its existing `B1-B2` band
  range) covers both without needing two ladder levels for it.
- **`horizontal_pull`** (8): pull-apart (lightest band, minimal ROM) → door-row → seated-row →
  bent-over-row → **`bw-inverted-row`** → wide-high-row → single-arm-row →
  **banded-archer-row (authored)**. Placing the one bodyweight rung (`bw-inverted-row`, anchor
  `pullup-bar`) mid-ladder rather than at either end is a judgment call — flagged below.
- **`vertical_push`** (7): overhead-press → half-kneeling-ohp (adds unilateral/stability demand)
  → single-arm-ohp (hardest band variant) → bw-dip → bw-pike-push-up → pike-push-up (banded) →
  **bw-wall-hspu (authored)**.
- **`vertical_pull`** (9): bw-dead-hang → straight-arm-pulldown → floor-pullover → lat-pulldown →
  upright-row → assisted-pull-up → bw-chin-up → bw-pull-up → **bw-archer-pull-up (authored)**.
- **`squat`** (7): bw-squat → bw-squat-pulse → goblet-squat → banded-squat → front-squat →
  bw-jump-squat → bw-pistol-squat. `bw-pistol-squat` kept in `squat` (not `lunge`) since it's a
  bilateral-stance squat pattern performed unilaterally — matches the prototype's own pattern
  tag. `bw-wall-sit` (isometric) and `bw-broad-jump`/`squat-jump` (distinct power movements) were
  deliberately left as `tier: fill` accessories, not ladder rungs.
- **`hinge`** (7): bw-good-morning → bw-glute-bridge → rdl → deadlift → sumo-deadlift →
  single-leg-rdl → bw-nordic-curl (hardest — eccentric hamstring loading).
- **`lunge`** (7): bw-reverse-lunge → split-squat → bw-walking-lunge → lateral-lunge → step-up →
  bulgarian-split-squat → bw-cossack-squat.
- **`anti_extension`** (7): bw-dead-bug → bw-bird-dog → bw-plank → banded-plank → bw-side-plank →
  side-plank-abduction → bw-hollow-hold.

### Judgment calls needing review
- **`bw-inverted-row` sits at `horizontal_pull.l5`, not the top.** Its `anchor` is `pullup-bar`
  (carried over unchanged from the prototype), which per §13.1 makes it `anchor_class:
  bodyweight_bearing` — off-by-default, effort-capped, confirmation-gated. That safety
  classification seems arguably wrong for a standard inverted row (feet on the ground, body at
  an angle — much closer to a `body-support` partial load than a full dynamic hang), but I did
  not change the anchor value since the brief frames existing anchor tags as trustworthy
  ("Most rungs already exist and need only tagging") and this is an anchor-safety-classification
  question, not a pattern-tagging one. **Worth a second opinion**: either re-anchor
  `bw-inverted-row` to `body-support` (loosens its safety gate to match its real demand), or
  leave it as-is and accept that this rung requires a purpose-built pull-up bar plus the
  bodyweight-bearing confirmation even though the movement itself is much gentler than a hang.
- **`hamstring-curl` and `tke` (terminal knee extension)** tagged `pattern: hip_extension` as the
  closest available accessory bucket — the §4.1 pattern enum has no `knee_flexion`/
  `knee_extension` isolation pattern, and both movements are genuinely knee-, not hip-, isolation
  work. Harmless to safety/selection (neither is laddered, `hip_extension` isn't a hard filter
  target), but a taxonomy gap worth a note for a future content pass.
- **Conditioning finishers** (`thruster`, `squat-to-press`, `deadlift-high-pull`,
  `clean-and-press`, `lunge-press`, `push-up-to-row`, `banded-burpee`, `bear-crawl`,
  `sprinter-pull`, `squat-to-chop`, `lunge-to-chop`, and the bodyweight conditioning set
  `bw-jumping-jack`…`bw-turkish-getup`) were assigned a primary-mover pattern from their
  `primary` muscle group (e.g. thruster's primary is `quads` → tagged `squat`) and forced to
  `tier: fill` even where that pattern is a ladder pattern, since they aren't canonical ladder
  rungs — they contribute pool volume/variety to that pattern's slot but never appear as a
  progression-family level. Confirm this matches how Wave 2's engine wants to treat "conditioning
  finisher" as a concept.
- **`contraindications[]`** is the field most worth a trainer/physio second pass. Built from a
  per-pattern base set (`PATTERN_BASE_CONTRA`) plus per-id `CONTRA_EXTRA`/`CONTRA_REMOVE`
  overrides in `migrate_library.py`, all with inline rationale comments. I erred generous per the
  brief ("a missing tag is a real hazard"). Highest-priority tags to double check: `core_pressure`
  and `lower_back_extension` across the `hinge` family (rdl, deadlift, sumo-deadlift,
  good-morning), the plank/hollow-hold branch of `anti_extension`, and the sit-up/crunch/v-up
  cluster tagged `lower_back_flexion` — these are exactly what §13.2's pregnancy bundle
  (`core_pressure`, `lower_back_extension`) hard-filters on.
- **`side-bend` and `standing-side-crunch`** retagged from the prototype's `flexion` to the new
  `lateral_flexion` pattern (they're lateral bends, not sagittal flexion) — without this,
  `lateral_flexion` had zero eligible main exercises for the `abs` template and the validator
  caught it.
- **`bw-wall-sit`** retagged from the prototype's `isolation` bucket to `pattern: squat` (it's an
  isometric knee-dominant hold) rather than any accessory bucket — `tier: fill`, not a ladder
  rung.
- No new dependencies added anywhere in this track.
- `packages/data/package.json` pins `typescript: 6.0.3` (root pins `5.9.3`) — pre-existing from
  1a-skeleton's scaffold, not touched by this track; flagging in case it's not intentional.
- Root `package.json`: added exactly one script, `"validate:library": "npm run validate:library
  --workspace packages/data"`, per the brief's explicit allowance. Nothing else touched.
- **Shared-worktree note for whoever reviews git history**: this track ran concurrently with
  1a-skeleton in the same working tree. The first 1b commit (`6e5ae14`) ended up including
  1a-skeleton's then-uncommitted scaffold files (`app/`, `packages/engine/`, `tools/`,
  `tsconfig.base.json`, etc.) because a plain `git commit` picked up everything staged in the
  shared index at commit time, not just the paths this track had explicitly `git add`ed — a
  race, not a deliberate scope decision. Nothing was lost or corrupted (all 1a files are present
  and correct in that commit), but the commit message and authorship attribution for those files
  is misleading. The second 1b commit (`29c0e4b`) used `git commit -- <exact paths>` to avoid a
  repeat. No action needed unless the commit history itself matters for this project's records.
