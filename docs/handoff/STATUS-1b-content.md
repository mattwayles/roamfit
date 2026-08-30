## Track: 1b-content — Exercise library & progression ladders
Last updated: 2026-08-30

### Done
- [x] Read CLAUDE.md, wave-01b-content.md brief, spec.md §4.1/4.2/5.5/6.1/6.2/6.6/13.1/13.2.
- [x] Copied source data conceptually (never mutated `~/.claude/skills/daily-workout/`); all
      transformation logic lives in `packages/data/scripts/migrate_library.py`, which reads the
      skill's `references/exercises.json` and writes `packages/data/library/exercises.json`.
- [x] `packages/data/src/schema.ts` — TS types for `Exercise`, `ProgressionFamily`, and the
      library wrapper types. Single source of truth for shape.
- [x] `packages/data/scripts/migrate_library.py` — full migration: mechanical fields
      (`anchor_class` derived from `anchor`, `demo_media` stub) AND all judgment fields (`role`,
      `metric`/`default_seconds`, `tier`, `contraindications`, `aliases`, and the pattern remap
      for the prototype's non-schema `isolation`/`conditioning`/`warmup`/`cooldown` buckets into
      real §4.1 patterns). Re-running it regenerates `library/exercises.json` from scratch, so
      every judgment call is in git, in one file, for review — see "Decisions / judgment calls"
      below for the ones to check most carefully.
- [x] `packages/data/src/validate.ts` — the hard validator. Checks: unknown enums, metric=time
      needs default_seconds (and vice versa), anchor_class must mechanically agree with anchor,
      band equipment needs non-null band (bodyweight needs null), duplicate exercise ids, no
      bundled `video_id`, family/level referential integrity (exercise exists, pattern matches,
      progression_family/level_id back-reference matches), duplicate/non-globally-unique
      `level_id`, every §5.5 template pattern slot has ≥1 eligible main exercise per focus, every
      focus has ≥1 warmup and ≥1 cooldown. Prints a coverage report (by pattern, focus, role,
      anchor_class, tier, family levels). Run with `node packages/data/src/validate.ts` or
      `npm run validate:library` (added to both root `package.json` and
      `packages/data/package.json` — root script delegates via `--workspace packages/data`).
- [x] Ran migration + validator. **All 196 exercises pass every check.** The only remaining
      validator failures are the 8 "missing required family" errors — expected, `families.json`
      is still an empty stub (`{"families": []}`).
- [x] `packages/data/src/index.ts` / `index.test.ts` updated to export `exerciseLibrary`,
      `familyLibrary`, and the schema types (was a placeholder left by the concurrent 1a-skeleton
      track — did not touch anything else 1a scaffolded in `packages/data/`).
- Commit: about to make first commit for this batch (schema + migrator + validator + tagged
  library + families stub). See git log after this file is written.

### In progress
- Nothing mid-flight. Batch 1 (schema, migration, validator, all judgment tags on all 196
  exercises) is complete and about to be committed as a whole (it was one coherent pass, not
  worth artificially splitting into 25-record commits since it was script-driven, not
  hand-typed per record).

### Next
1. Author the 8 progression families in `packages/data/library/families.json`, **one family per
   commit**, per the brief:
   `horizontal_push · horizontal_pull · vertical_push · vertical_pull · squat · hinge · lunge ·
   anti_extension`.
   - Each family needs 6-9 ordered levels, easiest → hardest, monotonic difficulty. Use stable
     `level_id` strings like `horizontal_push.l1`.
   - For each level, pick (or author) the exercise, then set that exercise's
     `progression_family` and `progression_level_id` in `packages/data/library/exercises.json`
     directly (the migration script does NOT know about families — after authoring families,
     hand-edit those two fields onto the chosen exercises, or extend the migration script with a
     `FAMILY_LEVELS` table and re-run it; either is fine, but re-running the script is safer
     since it keeps everything derivable from one file — **recommended**: add the family
     ladder tables to `migrate_library.py` alongside the other override tables, and have it also
     emit `families.json`, so both files stay generated from one source of truth).
   - Candidate ladders below, drawn from the id list in this migration (all ids already carry
     the right `pattern` after migration):
     - `horizontal_push` (18 candidates, pattern=horizontal_push): easiest→hardest roughly:
       `bw-wall-push-up` → `bw-incline-push-up` → `bw-knee-push-up` → `bw-push-up` →
       `banded-push-up` → `close-grip-push-up`/`bw-wide-push-up` → `bw-diamond-push-up` →
       `bw-decline-push-up` → `bw-archer-push-up`. **No one-arm push-up exists in the 196 —
       author it** (the brief explicitly calls this out as a known prototype gap) as the top
       rung above archer.
     - `horizontal_pull` (10 candidates): bodyweight pulling needs a pullup-bar anchor
       (`bw-inverted-row` is the only bodyweight horizontal pull; everything else is banded:
       `pull-apart`, `door-row`, `seated-row`, `bent-over-row`, `single-arm-row`,
       `wide-high-row`). Ladder likely: `bw-inverted-row` (feet-elevated is harder — may need to
       **author an elevated-feet inverted row variant** as a harder rung) →
       `door-row`/`seated-row` → `bent-over-row` → `wide-high-row` → `single-arm-row` (hardest,
       unilateral). Check archer-row-equivalent gap too.
     - `vertical_push` (6 candidates): `overhead-press` → `half-kneeling-ohp` →
       `single-arm-ohp` → `pike-push-up`/`bw-pike-push-up` → likely need to **author a
       decline/elevated pike push-up** as a harder rung, and possibly a handstand
       push-up progression at the very top (prototype has none — flag as a gap).
     - `vertical_pull`: `bw-dead-hang` → `lat-pulldown`/`straight-arm-pulldown` →
       `assisted-pull-up` → `bw-chin-up` → `bw-pull-up` → **author an archer pull-up /
       one-arm-assisted pull-up** as the top rung (explicit gap per brief).
     - `squat`: `bw-squat` → `bw-squat-pulse` → `banded-squat`/`goblet-squat` →
       `front-squat` → `bw-jump-squat`/`squat-jump` → `bw-pistol-squat` (hardest, unilateral —
       double check whether pistol belongs in `lunge` instead since it's single-leg; **decide
       and note it** — leaning toward keeping it in `squat` since it's a bilateral-stance squat
       pattern performed unilaterally, same as the prototype's `pattern: squat` tag says).
     - `hinge`: `bw-good-morning` → `glute-bridge`/`bw-glute-bridge` → `rdl` →
       `deadlift`/`sumo-deadlift` → `single-leg-rdl`/`bw-single-leg-rdl` → `bw-nordic-curl`
       (hardest — eccentric hamstring, genuinely brutal, good top rung).
     - `lunge`: `bw-reverse-lunge` → `split-squat`/`bw-walking-lunge` → `lateral-lunge` →
       `step-up`/`bw-step-up` → `bulgarian-split-squat`/`bw-bulgarian-split-squat` →
       `bw-cossack-squat` (hardest).
     - `anti_extension`: `bw-dead-bug`/`dead-bug` → `bird-dog`/`bw-bird-dog` → `bw-plank` →
       `banded-plank` → `bw-side-plank` → `side-plank-abduction` → `bw-hollow-hold` →
       possibly author a top rung like a weighted/banded hollow hold or dragon flag if one more
       level is wanted (6 is already enough per the 6-9 range).
   - **Author any missing exercise records directly in `library/exercises.json`** (or better,
     add them to the migration script's own exercise list so they survive re-runs) with real
     `setup` cues in the prototype's voice and a constructed `video_search` URL matching the
     existing pattern (`https://www.youtube.com/results?search_query=resistance+band+<Name>+proper+form+tutorial`
     for band exercises, drop "resistance+band+" for bodyweight). Note every newly authored
     record here.
2. After families.json is filled and every family-member exercise has its
   `progression_family`/`progression_level_id` set, re-run `npm run validate:library` and fix
   whatever it flags (referential breaks, pattern mismatches, non-monotonic levels aren't
   mechanically checkable — eyeball each ladder for genuine easy→hard ordering).
3. Double check the §5.5 pattern-slot coverage the validator already prints is a reasonable
   proxy for the real focus templates (upper/legs/abs/full) — the validator's
   `TEMPLATE_PATTERNS` map is my best-effort read of §5.5's prose lists (push/pull/vertical/
   isolation for upper; squat/hinge/lunge/hip_extension/abduction/calf for legs;
   anti_rotation/flexion/anti_extension/lateral_flexion for abs; squat/hinge/horizontal_push/
   horizontal_pull/anti_extension for full) — worth a second look once families are in.
4. Write the final coverage report summary into this status file once green.

### Decisions / judgment calls needing review
- **Pattern remap for prototype's non-schema buckets** (`isolation`, `conditioning`, `warmup`,
  `cooldown` — 73 records) — full mapping and rationale is inline in
  `packages/data/scripts/migrate_library.py`'s `PATTERN_OVERRIDES` dict. Two flagged as
  genuinely uncertain because no clean §4.1 bucket exists:
  - `hamstring-curl` → tagged `hip_extension` (closest available; it's actually a knee-flexion
    isolation, no such pattern exists in the enum).
  - `tke` (terminal knee extension) → tagged `hip_extension` (closest available; it's actually a
    quad/knee-extension isolation, no such pattern exists in the enum).
  Both are harmless to selection/safety either way since neither is a laddered pattern, but
  worth a second opinion on whether §4.1's pattern enum should just grow a `knee_flexion`/
  `knee_extension` accessory pattern in a future content pass.
- **Conditioning finishers assigned to a primary-mover pattern** (`squat`, `hinge`, `lunge`,
  `horizontal_push`, `anti_extension`) based on each exercise's `primary` muscle group in the
  source data (e.g. thruster's primary is `quads` → tagged `squat`). All forced to `tier: fill`
  even though some share a ladder pattern, since they're not canonical ladder rungs (see
  `FORCE_FILL` in the migration script). Worth confirming these shouldn't instead get their own
  non-laddered pattern tag if the engine ever wants to treat "conditioning finisher" as a
  distinct slot — right now they just contribute volume to their assigned pattern's pool.
- **`contraindications[]`** — built from a per-pattern base set (`PATTERN_BASE_CONTRA` in the
  migration script) plus per-id `CONTRA_EXTRA`/`CONTRA_REMOVE` overrides, all with inline
  rationale comments. This is the single field most worth a second pass by someone who knows the
  movements well — I erred generous per the brief's instruction ("a missing tag is a real
  hazard"), but a physio/trainer review of the full `contraindications` column before ship would
  be worthwhile. Nothing here is a guess I'd call confident at the level pregnancy-bundle
  filtering (`core_pressure`, `lower_back_extension`) deserves — please double check those two
  tags in particular across the hinge/plank/hollow-hold families since §13.2 calls out pregnancy
  as the motivating hard-filter case.
- **`side-bend` and `standing-side-crunch`** were retagged from the prototype's `flexion` to the
  new `lateral_flexion` pattern — they are lateral bends, not sagittal-plane flexion, and
  `lateral_flexion` had zero eligible main exercises for the `abs` focus template without this
  fix (the validator caught this exact gap).
- **`bw-wall-sit`** tagged `pattern: squat` (isometric knee-dominant hold) rather than leaving it
  in the old `isolation` bucket — feeds the legs/squat slot, tier `fill` (not a ladder rung).
- No new dependencies added. Migration script requires only python3 stdlib (`json`, `pathlib`).
  Validator requires only Node's built-in TS type-stripping (confirmed working on Node v26 with
  `node packages/data/src/validate.ts` — no ts-node/tsx needed, none was installed at the
  workspace root at time of writing).
- `packages/data/package.json` had `typescript: 6.0.3` pinned already (root pins 5.9.3) — not
  touched, may be a leftover from concurrent 1a-skeleton scaffolding; flagging in case it's not
  intentional.
- Root `package.json`: added exactly one script, `validate:library`, delegating to the
  `packages/data` workspace script, per the brief's explicit allowance. Nothing else touched.
- `packages/data/jest.config.js` / test harness: `npx jest` currently fails with
  `Preset ts-jest not found` — `npm install` has apparently not been run at the repo root yet
  (no `ts-jest` under `node_modules/`). This predates this track's work (1a-skeleton's stub test
  had the same dependency); not something 1b broke, but worth running `npm install` before
  anyone relies on `npm test` in `packages/data`.
