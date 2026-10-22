## Track: 45 — Field Guide muscle map
Last updated: 2026-10-21
### Done
- [x] Stick-figure movement pictograms (6be989e) — rejected by the user as childish; removed.
- [x] Front/back muscle map on every Field Guide row (6e1e2e9).
- [x] User preferred one figure per row: front or back by the headline (first) primary muscle
  (see git log, "Field Guide: one figure").
### In progress
- none
### Next
- Device pass: legibility of the 46pt figure in both themes, and a fast fling through the list
  (each row is one Svg of three merged paths).
- The rest of the row clean-up is in BACKLOG ("Field Guide rows").
### Decisions / gotchas
- New dependency: `react-native-body-highlighter` 3.2.0 (MIT, pinned exact). JS only, on top of
  the already-installed `react-native-svg` - no native rebuild. Only its anatomy path data is used
  (`dist/assets/bodyFront|bodyBack`); its own `Body` renderer draws ~90 paths per figure, too heavy
  for a long list. `lib/muscleMap.ts` merges each shade into one path, memoised per muscle set.
- Chart has no lats, side/rear delts, abductors or hip flexors: mapped to upper back, deltoids,
  glutes and quads (`MUSCLE_REGIONS`). A test fails if the library gains a token with no region.
- One figure per row, chosen by `MUSCLE_SIDE[primary[0]]` (`exerciseChartSide`) - the same muscle
  the subtitle names. Regions on both figures (delts, triceps, calves, traps, adductors, forearms)
  have a fixed preferred side there. Tile crop: x 140..584 of the 724-wide side (`MuscleMap.tsx`).
