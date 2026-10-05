## Track: 28 — Midnight Green recolor
Last updated: 2026-10-04
### Done
- [x] Increment 1: pure renames (pine->teal, pineDeep->tealDeep, lagoon->periwinkle, goldenHour->midnight, daylight->daybreak; copy Golden Hour/Daylight -> Midnight/Daybreak), values unchanged. 8a095fd
- [x] Increment 2: new values in palettes.ts, pinned hexes in tests, hue-distance test, day-cell chroma floor 45 -> 40 (lighter Midnight teal vivid at 40% over paper measures 43). b12d185
- [x] Increment 3: docs/DESIGN.md palette sections and BACKLOG device-pass item.
### In progress
- Nothing. Track complete bar the device pass (BACKLOG: "Midnight Green recolor — device pass owed").
### Next
- Device check; app icon/splash art still old colors (BACKLOG).
### Decisions / gotchas
- Stored theme preference values ('system'|'light'|'dark') unchanged; no migration.
- migrations/0022_theme_preference.sql (and its copy in migrations/data.ts, kept byte-identical by a test) still say Daylight/Golden Hour in a comment; migrations are not edited.
- STATUS-22-daylight.md and other historical handoffs left alone.
- periwinkle is only ~15-20 degrees of hue from sky/summit (all three blue-violet by request); the hue test pins teal >= 20 from them and periwinkle >= 15.
- ExercisesScreen.test.tsx times out (first test, `render` not called) under a loaded full `npm run check`; passes alone and in `cd app && npx jest`.

## Track: 28b — Accent spread (summit -> plum, periwinkle -> coral)
Last updated: 2026-10-04
(Same file as track 28; sky stays. periwinkle/summit sat too close to sky on the Journey tiles.)
### Done
- [x] Increment 1: pure rename periwinkle -> coral (token, gradient key, tone props, comments), values unchanged.
### In progress
- Increment 1 (rename), then 2 (summit plum #C77DFF/#7E2BB0, coral #FF8A5C/#B4441C + gradients, hue test over {teal,sky,summit,coral,gold,rose} >= 20 deg), then 3 (DESIGN.md + BACKLOG device-pass note).
### Next
- Increments 2 and 3 as above.
### Decisions / gotchas
- Token `summit` keeps its name (semantic); only its value changes.
