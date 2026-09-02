## Track: 13 — A role is a property, not a name

Last updated: 2026-09-02

The request: warm-ups are currently a *separate species* of exercise — a handful of records whose
names literally start "Warm-Up", each usable only in the warm-up section, several of them duplicates
of a real main exercise. They should instead be ordinary library records that declare which sections
they are eligible for, and the same exercise should be programmable as a warm-up (lighter) or as
main work (full dose). True mobility drills (cat-cow, scapular push-ups, arm circles) stay warm-up
only, because they are not training a muscle group.

### Done
- [x] Increment 1 — the mechanical shape change: `Exercise.role: Role` → `Exercise.roles: Role[]`
  across `packages/data` (schema, validator, all 219 records as single-element arrays),
  `packages/engine` (`candidates`, `warmupCooldown`, `swap`), `packages/store` and `app/`
  (catalogue filter, Approval's add-exercise pool, detail screen). No eligibility changed, so the
  golden snapshot is untouched — proof the change really was mechanical.

### In progress
- Increment 2 — the engine behaviour reuse requires: a warm-up/cool-down pick must never repeat an
   exercise already used elsewhere in the same session (`pipeline` passes the main picks' ids as
   `excludeIds`, and `selectWarmupCooldownGroup` merges rather than overwrites them), and
   `prescribeWarmupCooldown` must give a *band* exercise its lightest band rather than `null`, plus
   cap a reused main hold's duration.
1. Increment 3 — the content pass: delete the duplicate `wu-` records, rename the remaining
   "Warm-Up X" names, and widen `roles` per the judgment table below.
2. Increment 4 — regenerate the golden snapshot, `npm run check`, backlog note.

### Decisions / gotchas
- **`roles` is an array on the library record; `SessionEntry.role` stays singular.** The entry
  records the section an exercise actually ran in, which is still exactly one thing. That also keeps
  `sessionsAgo(history, id, role)` meaningful: "when did I last do this *as a warm-up*".
- **Duplicate `wu-` records are deleted, not renamed.** Their main counterparts already exist and
  several are ladder anchors, so the main id has to be the survivor: `wu-pull-apart`→`pull-apart`,
  `wu-lateral-walk`→`lateral-walk`, `wu-glute-bridge`→`bw-glute-bridge`, `wu-deadbug-bw`→
  `bw-dead-bug`, `wu-scap-push-up`→`bw-scap-push-up`, `wu-band-row`→`door-row`/`seated-row`.
  Consequence: any existing history row referencing a deleted id is orphaned — the UI already falls
  back to the raw id (`exercise?.name ?? entry.exerciseId`) and the detail screen has a
  "not in the library any more" guard, so nothing crashes, but that history no longer rolls up under
  the surviving exercise. Judged worth it: the alternative is keeping a permanent duplicate.
- **Ids are never renamed**, only names. An id is a stable identifier (invariant 5's spirit) and
  every per-user row in `exercise_state` is keyed by it. So `wu-band-external-rotation` keeps its
  `wu-` id while becoming "Band External Rotation", warm-up *and* main eligible.
- **`bw-scap-push-up` loses `main`.** It is currently a main-eligible record; the user named
  scapular push-ups explicitly as a drill that should not count as main work.
- Judgment rule for widening a main exercise to `warmup`: low skill, low load, ramp-up rather than
  work — activation (glutes, scaps, rotator cuff), pattern practice at bodyweight, light band rows
  and pull-aparts, easy calf/ankle prep, and the two cardio openers (jumping jacks, high knees).
  Excluded: anything `hard`, anything plyometric or max-effort, anything on a pull-up bar or other
  `bodyweight_bearing` anchor, and every loaded ladder rung above the bottom.
