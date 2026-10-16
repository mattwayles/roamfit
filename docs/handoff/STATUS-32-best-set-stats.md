## Track: 32 — Trail Best set: single-value stats instead of a line graph
Last updated: 2026-10-16
### Done
- [x] `buildBestSetStats` (lib/ladderSeries.ts); `TrailLevelPage.best` -> `bests`; Trail card Best set
  renders one row per exercise ("12 reps @ B3"); tests updated. One commit — see git log.
### In progress
- Nothing; track complete pending the device pass in BACKLOG (History / progress graphs).
### Next
- Device pass.
### Decisions / gotchas
- Value = best reps/seconds among sessions at the exercise's HEAVIEST band (`BAND_ORDER`), so a bigger
  number on a lighter band never wins. Bodyweight sessions only count when there is no banded one.
- Scope: Trail cards only (per level page, so a level's sibling exercises each get a row). Exercise
  detail's Best set line chart and `buildBestSetSeries` are untouched.
