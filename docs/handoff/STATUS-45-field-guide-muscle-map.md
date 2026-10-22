## Track: 45 — Field Guide muscle map
Last updated: 2026-10-21
### Done
- [x] Stick-figure movement pictograms (6be989e) — rejected by the user as childish; removed.
- [x] Front/back muscle map on every Field Guide row (see git log, "Field Guide: muscle map").
### In progress
- none
### Next
- Device pass: legibility at 52pt in both themes, and a fast fling through the list (each row is
  one Svg of six merged paths).
- The rest of the row clean-up is in BACKLOG ("Field Guide rows").
### Decisions / gotchas
- New dependency: `react-native-body-highlighter` 3.2.0 (MIT, pinned exact). JS only, on top of
  the already-installed `react-native-svg` - no native rebuild. Only its anatomy path data is used
  (`dist/assets/bodyFront|bodyBack`); its own `Body` renderer draws ~90 paths per figure, too heavy
  for a long list. `lib/muscleMap.ts` merges each shade into one path, memoised per muscle set.
- Chart has no lats, side/rear delts, abductors or hip flexors: mapped to upper back, deltoids,
  glutes and quads (`MUSCLE_REGIONS`). A test fails if the library gains a token with no region.
- Tile crop: each 724-wide side cropped to x 140..584, back slid left to sit 60 units from the front
  (`MuscleMap.tsx`). Change those if the package's artwork changes.
