## Track: 29 — Ladder-position "Progress" chart + band-aware Best set
Last updated: 2026-10-05
### Done
- [x] 1. Engine ladderPosition + 14 tests (a01f529)
### In progress
- Increment 2 (committing store+chartGeometry+ladderSeries; trailProgress.ts/test rewrite is held for increment 3 with its component): store (done in tree: getExercisePerformanceHistory now returns progressionFamilyId/progressionLevelIdAtTime) + app lib: new app/src/lib/ladderSeries.ts (buildLadderSeries, buildBestSetSeries, rung markers), chartGeometry ChartMarker.kind ('rung'|'band'), trailProgress.ts and exerciseProgress.ts consume them. ProgressChart gets optional `describeValue(index)` for the readout ("8 reps @ B3") and draws band ticks inside the plot. Decisions: best-set segment = (exercise, band) pair in order of first appearance; Progress line is ONE colour, unbroken except gaps for unplaceable sessions; no rung markers on exercise detail.
### Next
2. Store: add progressionFamilyId/progressionLevelIdAtTime to per-exercise history (+tests); app lib builders for the Progress series and band-aware best-set series (trail + exercise).
3. Trail card UI: Progress / Best set toggle (Progress default), rename TrailBestSetChart -> TrailProgressChart.
4. Exercise detail UI: Progress / Best set / Total volume (Progress only when placeable sessions exist).
5. Docs: DESIGN.md, BACKLOG.md device-pass item.
### Decisions / gotchas
- Problem: band step-up with fewer reps read as a decline on a reps-only chart; the engine treats it as a step forward.
- Progression is tracked against the level's ANCHOR exercise (mirror `currentExercise`). Known backlog bug (frozen band at bodyweight-anchored rung) is mirrored, not fixed: a band sibling at such a rung gets credit via reps/tempo/rest/sets only, its band is ignored.
- Position definition: walk microAdvance from the anchor's default micro; credit steps whose state is <= performed state, lexicographic (sets, -rest, tempo, band, reps most->least significant). Performed is clamped into the anchor's grid (below floor = floor, above cap = cap). Sessions with no value in the anchor's unit, or unknown level id, return null (gap).
