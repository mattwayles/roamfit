## Track: 28 — Midnight Green recolor
Last updated: 2026-10-04
### Done
- [x] Increment 1: pure renames (pine->teal, pineDeep->tealDeep, lagoon->periwinkle, goldenHour->midnight, daylight->daybreak; Golden Hour/Daylight copy -> Midnight/Daybreak). Values unchanged.
### In progress
- Increment 2 (see Next).
### Next
- Increment 2: new values in app/src/theme/palettes.ts (Midnight teal #4FB8C4 / tealDeep #2E8C98 / periwinkle #7F97FF; Daybreak teal #004C54 / tealDeep #003A40 / periwinkle #3B4FC2; gradients per request), update pinned hexes in tests, hunt old hexes elsewhere.
- Increment 3: docs/DESIGN.md palette sections, BACKLOG device-pass item, finalise this file.
### Decisions / gotchas
- Stored theme preference values ('system'|'light'|'dark') are unchanged; no migration.
- migrations/0022_theme_preference.sql comment still says Daylight/Golden Hour (left: migration files are not edited).
- STATUS-22-daylight.md and other historical handoffs left alone.
