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
- [x] Increment 1: pure rename periwinkle -> coral (token, gradient key, tone props, comments), values unchanged. 6892fc5
- [x] Increment 2: summit plum + coral values, tests, hue-spread test 5505c97
- [x] Increment 3: DESIGN.md palette/gradients/onGradient prose and BACKLOG device-pass note.
### In progress
- Nothing; track 28b complete bar the device pass (BACKLOG).
### Next
- Device pass.
### Decisions / gotchas
- Token `summit` keeps its name (semantic); only its value changes.
- Increment 2 also made `onGradient` always 'ink' (Midnight plum gradient: ink >= 4.9:1, paper only 1.9-3.5:1); the old summit->paper special case is gone.
- Hue test now: every pair of {teal, sky, summit, coral, gold, rose} >= 20 deg in both themes (tightest: coral-gold 22.0, teal-sky 25.1/29.6).
- Daybreak coral nudged #B4441C -> #B04219 (same hue, 16.3 deg): #B4441C is 4.38:1 as text on its own 8% tint over bg (floor 4.5); #B04219 is 4.54, white 5.77, surface2 4.70.
- Daybreak chip hue gaps: coral-gold 22.0 (both themes), coral-rose 37.2/41.7.
