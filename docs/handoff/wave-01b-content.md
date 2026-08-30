# Wave 1B — Exercise library & progression ladders

**Track id:** `1b-content` · **Status file:** `docs/handoff/STATUS-1b-content.md`
**Spec sections to read:** §4.1, §4.2, §6.1, §6.2, §6.6, §13.1, §13.2, §5.5. Read those and
stop — do not read the whole spec.

This is the content foundation the engine (Wave 2) is built on. Getting the tags right matters
more than getting them fast. **This track is expected to span multiple sessions.**

## Source material

`~/.claude/skills/daily-workout/references/exercises.json` — 196 records, the existing library.
Also read `~/.claude/skills/daily-workout/SKILL.md` sections "Anchors", "Band selection",
"Equipment mix", and "Focus templates" — they encode domain knowledge that must survive the port.
`~/.claude/skills/daily-workout/references/equipment.md` describes the actual band setup.

Copy the source into the repo; never mutate the skill directory.

## Goal

`packages/data/` containing:
1. `library/exercises.json` — all 196 records migrated to the §4.1 schema with every new field
   populated.
2. `library/families.json` — the 8 §6.6 progression families with ordered, stably-identified
   levels.
3. `schema.ts` — TypeScript types for both, the single source of truth for shape.
4. `validate.ts` + `npm run validate:library` — hard validation, exits non-zero on any problem.

## The new fields (§4.1)

| Field | How to determine it |
|---|---|
| `anchor_class` | **Mechanically derived** from `anchor` per §13.1. `pullup-bar`/`body-support` → `bodyweight_bearing`; `none` → `none`; everything else → `band_tension`. Script this; do not hand-tag it. |
| `metric` | `reps` \| `time` \| `amrap`. Judgment. Planks, holds, wall sits, dead hangs, carries → `time`. |
| `default_seconds` | Required when `metric: time`, null otherwise. |
| `role` | `warmup` \| `main` \| `cooldown`. Judgment. Every focus template needs a matched warmup and cooldown pool (§5.5), so check pool coverage per pattern when you are done — a focus with no eligible warmup is a bug. |
| `contraindications[]` | Judgment, from the §4.1 tag list. Be **generous but precise**: this is a safety filter (§13.2), so a missing tag is a real hazard, and a spurious one silently shrinks the pool. Tag on the movement's actual demand — an overhead press is `shoulder_overhead`; a jumping variant is `knee_impact`; a loaded deep knee bend is `knee_flexion_loaded`; a full sit-up is `lower_back_flexion`. |
| `aliases[]` | Search synonyms. Cheap; a few per record. |
| `tier` | `core` \| `fill` \| `stretch` — carry over from the prototype if present, else assign. |
| `progression_family` / `progression_level_id` | See below. Null for every accessory-pattern exercise. |
| `demo_media` | Stub as `{ type: "figure", id: "<exercise_id>" }`. The figures themselves are Wave 6; the field just needs to exist and be consistent. |

**Never add a `video_id` field to the bundled library.** Curated ids are remote config only
(§11.4). The validator must reject a bundled `video_id`.

## The 8 ladders (§6.6)

`horizontal_push` · `horizontal_pull` · `vertical_push` · `vertical_pull` · `squat` · `hinge` ·
`lunge` · `anti_extension`.

- 6–9 ordered levels each, easiest → hardest. §6.1 shows the shape for `horizontal_push`.
- `level_id` is **assigned once and never reordered or reused** — invariant 5 in `CLAUDE.md`.
  Use a stable string (e.g. `horizontal_push.l4`), not an array index. The validator must check
  that ids are unique within a family and that no exercise references a missing one.
- Most rungs already exist in the 196 records and need only tagging. Where a ladder has a genuine
  gap (§11.4 notes the prototype lacks e.g. archer/one-arm variants), **author the missing
  exercise record** with a real `setup` cue in the prototype's voice and a constructed
  `video_search` URL. Note every newly authored record in the status file so it can be reviewed.
- Every exercise carrying a `progression_family` must also carry a `progression_level_id` in
  that family, and vice versa. Accessory patterns (§6.6 list) carry `null` for both.
- Ladders must be genuinely monotonic in difficulty. A rung that is easier than the one below it
  is the one bug here that quietly breaks §6.3 forever.

## The validator — this is the deliverable that keeps the data honest

Fail loudly on: unknown enum values; `metric: time` without `default_seconds`; band exercises
with `anchor: none` that actually need one; `equipment: band` with a null `band`; duplicate ids;
family/level referential breaks; duplicate or non-unique `level_id`; an exercise in a family
whose `pattern` disagrees with the family's; any bundled `video_id`; a `focus` with no eligible
warmup or cooldown; a pattern slot in any §5.5 template with zero eligible exercises;
`anchor_class` disagreeing with `anchor`. Print a coverage report: exercises per pattern, per
focus, per role, per anchor class, and per family level.

## Working order (batch this — you will be interrupted)

1. Copy source data in, write `schema.ts`, write the migration script for the mechanical fields
   (`anchor_class`, `demo_media`, field renames). Commit.
2. Write the validator against the schema, with the library still failing it. Commit.
3. Hand-tag judgment fields (`role`, `metric`, `default_seconds`, `contraindications`, `aliases`)
   **in batches of ~25 exercises**, committing each batch. Update the status file with the batch
   boundary *before* starting each batch.
4. Author the 8 families **one family per commit**, adding any missing exercise records as you go.
5. Green the validator. Write the coverage report into the status file.

## Done criteria

- [ ] `npm run validate:library` exits 0 with a printed coverage report.
- [ ] All 196 (+ any newly authored) records carry every §4.1 field.
- [ ] 8 families, 6–9 stably-identified monotonic levels each, all references resolving.
- [ ] Every §5.5 template pattern slot has eligible exercises at every focus, with warmup and
      cooldown pools covered.
- [ ] Newly authored exercises and any judgment calls you were unsure about are listed in the
      status file for review.
