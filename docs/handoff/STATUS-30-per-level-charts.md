## Track: 30 — Trail charts: one graph per level, paged with arrows

Last updated: 2026-10-06

### Done

- [x] 1. lib: `buildTrailProgress` returns `levels: TrailLevelPage[]` + `currentLevel`;
      `buildLadderSeries` `{ withinRung }` (stepsInRung). 2. TrailProgressChart level pager. 3. DESIGN.md + BACKLOG device-pass item (6). One commit — see git log.

### In progress

- Nothing; track complete pending the device pass in BACKLOG.

### Next

- Device pass (BACKLOG 'History / past months / progress graphs', item 6).

### Decisions / gotchas

- User feedback: at a level change Best set drops (harder exercise, fewer reps) and reads as a
  regression even with the dashed tick. Fix = never put two levels on one graph.
- Pages are grouped by level id (not contiguous stints), ordered easiest → hardest; a level-down
  and back puts both stints on the same page with an honest time gap.
- Sessions with a null level id are attributed by `exercise_ids` membership when exactly one level
  holds the exercise; otherwise they are left off the paged charts (still in the exercise rows).
- Per-level Progress plots steps within the rung (zero-based), not the cumulative ladder position.
- Pager title is "Level 2 · <anchor>", not "Level 2 of 7": the card's level line already
  says "Level N of M" (and a Journey test asserts it is unique within the row).
- Exercise detail is NOT paged: an exercise belongs to one level, so its chart is single-level.
