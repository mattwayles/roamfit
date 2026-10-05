## Track: 29 — Ladder-position "Progress" chart + band-aware Best set
Last updated: 2026-10-05
### Done
- [x] 1. Engine ladderPosition + 14 tests (a01f529)
- [x] 2. Store fields + lib/ladderSeries + marker kind (82c94d8)
### In progress
- Increment 3 (committing): trailProgress.ts rewrite, TrailBestSetChart renamed TrailProgressChart (Progress/Best set Chip toggle, testIDs board-chart-*, board-chart-plot-*, board-chart-mode-*), ProgressChart band ticks + describeValue, Journey tests updated.
### Next
4. Exercise detail UI: Progress / Best set / Total volume (Progress only when buildExerciseLadder returns non-null; else default Best set). Use buildExerciseBestSeries + buildExerciseLadder from lib/ladderSeries.ts; families via familyLibrary on the screen (see progressionLabel).
5. Docs: DESIGN.md, BACKLOG.md device-pass item.
### Decisions / gotchas
- Problem: band step-up with fewer reps read as a decline on a reps-only chart; the engine treats it as a step forward.
- Progression is tracked against the level's ANCHOR exercise (mirror `currentExercise`). Known backlog bug (frozen band at bodyweight-anchored rung) is mirrored, not fixed: a band sibling at such a rung gets credit via reps/tempo/rest/sets only, its band is ignored.
- Position definition: walk microAdvance from the anchor's default micro; credit steps whose state is <= performed state, lexicographic (sets, -rest, tempo, band, reps most->least significant). Performed is clamped into the anchor's grid (below floor = floor, above cap = cap). Sessions with no value in the anchor's unit, or unknown level id, return null (gap).
