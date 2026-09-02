## Track: 13 — A role is a property, not a name

Last updated: 2026-09-02

The request: warm-ups were a *separate species* of exercise — a handful of records whose names
literally started "Warm-Up", each usable only in the warm-up section, several of them duplicates of a
real main exercise. They are now ordinary library records that declare which sections they are
eligible for, and the same exercise can be programmed as a warm-up (lighter) or as main work (full
dose). True mobility drills (cat-cow, scapular push-ups, arm circles) stay warm-up only, because they
are not training a muscle group.

### Done
- [x] Increment 1 — the mechanical shape change: `Exercise.role: Role` → `Exercise.roles: Role[]`
  across `packages/data` (schema, validator, all 219 records as single-element arrays),
  `packages/engine` (`candidates`, `warmupCooldown`, `swap`), `packages/store` and `app/`
  (catalogue filter, Approval's add-exercise pool, detail screen). No eligibility changed, so the
  golden snapshot was untouched — proof the change really was mechanical. (4f3776f)
- [x] Increment 2 — what reuse needs: a warm-up band exercise gets its lightest band instead of
  `null`, holds used as a warm-up are capped at 45s (a stretch keeps its authored cool-down
  length), and no exercise is drawn twice in one session (`pipeline` passes the main picks to
  warm-up selection and both to cool-down selection; the group loop merges the caller's exclusions
  instead of overwriting them). (ff4c26c)
- [x] Increment 3 — the content pass. 219 → 213 records; roles now `main: 194, warmup: 46,
  cooldown: 16`, 43 records eligible for more than one section. No name contains "Warm-Up".

### In progress
- Nothing. The track is complete as specified.

### Next
- Only what feedback asks for. The judgment table below is the thing most likely to need tuning:
  if a warm-up shows up that reads as a working set (or vice versa), edit that record's `roles`.

### Decisions / gotchas
- **`roles` is an array on the library record; `SessionEntry.role` stays singular.** The entry
  records the section an exercise actually ran in, which is still exactly one thing. That also keeps
  `sessionsAgo(history, id, role)` meaningful: "when did I last do this *as a warm-up*".
- **Exclusions are applied before the focus preference, not after** (`selectWarmupCooldown`).
  Matching the day's focus already falls back to the whole role pool when it can't be met; applying
  it first and *then* removing ids taken elsewhere could empty a one-deep focus pool and return
  nothing. Real case caught by the property sweep: under a band-only equipment preference the abs
  cool-down pool is a single band stretch, so a warm-up that took it left the session with no
  cool-down at all.
- **Duplicate `wu-` records were deleted, not renamed.** Their counterparts already existed and
  several are ladder anchors, so the main id had to be the survivor: `wu-pull-apart`→`pull-apart`,
  `wu-lateral-walk`→`lateral-walk`, `wu-glute-bridge`→`bw-glute-bridge`, `wu-deadbug-bw`→
  `bw-dead-bug`, `wu-scap-push-up`→`bw-scap-push-up`, `wu-band-row`→`door-row` (which also gained
  the alias "band row"). Consequence: a history row referencing a deleted id is orphaned — the UI
  falls back to the raw id and the detail screen has a "not in the library any more" guard, so
  nothing crashes, but that history no longer rolls up under the surviving exercise.
- **Ids were never renamed**, only names. An id is a stable identifier and every per-user row in
  `exercise_state` is keyed by it, so `wu-band-external-rotation` keeps its `wu-` id while being
  named "Band External Rotation" and eligible for warm-up *and* main.
- **The scap-push-up merge kept the stricter contraindications.** The two duplicate records
  disagreed: the warm-up had only `wrist_extension`, `bw-scap-push-up` also has `shoulder_overhead`.
  Loosening a §13.2 safety tag is not a refactor's call (invariant 3), so the stricter tagging
  survived and the question is parked in `docs/BACKLOG.md`.
- **`bw-scap-push-up` lost `main`.** The user named scapular push-ups explicitly as a drill that is
  not main work.

### The judgment table (increment 3)

Warm-up only (drills, not training): `wu-arm-circles`, `wu-hip-hinge`, `bw-scap-push-up`.
Warm-up + cool-down (mobility that works at either end): `wu-cat-cow`, `wu-thread-the-needle`,
`wu-world-greatest`, `wu-shoulder-passthrough`, `cd-thoracic-rotation`.
Warm-up + main: `wu-band-external-rotation`, plus 36 existing main exercises —
glute/hip activation (`clamshell`, `bw-fire-hydrant`, `lateral-walk`, `monster-walk`,
`hip-abduction`, `glute-bridge`, `bw-glute-bridge`, `frog-pump`, `glute-kickback`,
`bw-donkey-kick`), trunk activation (`bird-dog`, `bw-bird-dog`, `bw-dead-bug`, `bw-superman`),
ankle/knee prep (`calf-raise`, `bw-calf-raise`, `tke`), bodyweight pattern practice
(`bw-good-morning`, `bw-squat`, `bw-squat-pulse`, `bw-tempo-squat`, `bw-reverse-lunge`), light band
pulling/pressing (`pull-apart`, `overhead-pull-apart`, `face-pull`, `door-row`, `seated-row`,
`banded-lat-pull-hold`, `standing-chest-press`, `bw-wall-push-up`), shoulder prep (`band-shrug`,
`front-raise`, `lateral-raise`, `bw-prone-ytw`, `ytw-raise`) and the two cardio openers
(`bw-jumping-jack`, `bw-high-knees`).
Excluded on purpose: anything `hard`, anything plyometric or max-effort, anything on a
`bodyweight_bearing` anchor, and every loaded ladder rung above the bottom.
