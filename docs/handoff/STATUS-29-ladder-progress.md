## Track: 29 — Ladder-position "Progress" chart + band-aware Best set
Last updated: 2026-10-05
### Done
- [x] 1. Engine ladderPosition + 14 tests (commit below; sha filled in next increment)
### In progress
- Increment 2: store fields + app lib builders.
### Next
2. Store: add progressionFamilyId/progressionLevelIdAtTime to per-exercise history (+tests); app lib builders for the Progress series and band-aware best-set series (trail + exercise).
3. Trail card UI: Progress / Best set toggle (Progress default), rename TrailBestSetChart -> TrailProgressChart.
4. Exercise detail UI: Progress / Best set / Total volume (Progress only when placeable sessions exist).
5. Docs: DESIGN.md, BACKLOG.md device-pass item.
### Decisions / gotchas
- Problem: band step-up with fewer reps read as a decline on a reps-only chart; the engine treats it as a step forward.
- Progression is tracked against the level's ANCHOR exercise (mirror `currentExercise`). Known backlog bug (frozen band at bodyweight-anchored rung) is mirrored, not fixed: a band sibling at such a rung gets credit via reps/tempo/rest/sets only, its band is ignored.
- Position definition: walk microAdvance from the anchor's default micro; credit steps whose state is <= performed state, lexicographic (sets, -rest, tempo, band, reps most->least significant). Performed is clamped into the anchor's grid (below floor = floor, above cap = cap). Sessions with no value in the anchor's unit, or unknown level id, return null (gap).
