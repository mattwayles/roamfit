## Track: 24 — Pine replaces ember as the primary accent
Last updated: 2026-10-02

Request (user feedback): keep the deep outdoor feel of Golden Hour / Daylight but stop using burnt-ember
orange as the primary color. Replace `ember` + `emberDeep` outright with a pine green, "shifted towards
fern" (hue ~138). Spotify-green proximity was discussed and explicitly accepted.

### Done
- [x] Token rename `ember`->`pine`, `emberDeep`->`pineDeep`, gradient `sunrise`->`trail`, values unchanged (8aec2b5).
- [x] New values in `palettes.ts` + test literals; `npm run check` green incl. contrast floors (1215c96).
- [x] `docs/DESIGN.md` palette/prose and `docs/BACKLOG.md` renamed and revalued; device pass and the
      theme-name question parked in BACKLOG under "Pine recolor" (this commit).

### In progress
- Nothing. Track is code-complete; only the device pass in BACKLOG remains.

### Next
- Device pass (BACKLOG "Pine recolor"); then delete that BACKLOG item.

### Decisions / gotchas
- Values (HSV hue 138): Golden Hour `pine #4FD176`, `pineDeep #209E46`; Daylight `pine #10702D`,
  `pineDeep #0A6124`. Contrast checked by script against the `themes.test.ts` floors (>= 4.5 as text on
  bg/surface/surface2, white legend >= 4.5, tint headroom).
- Gradient `trail` replaces `sunrise`: Golden Hour `#40BD6E -> #5EE06B`; Daylight stops must hold white
  >= 4.2:1 (asserted in `themes.test.ts`).
- Lagoon (teal, hue 172) stays as-is. Pine sits ~34 degrees from it; watch Full-body focus and the cooldown
  rail against the Main rail on a device.
- Theme names "Golden Hour" / "Daylight" are NOT renamed — user has not decided. Gold, sun and rose keep
  the warm side of the palette.
- Blue (`sky`) is the informational/status accent (Paused chip, anchor badge, Details cards, Travel
  marker); do not promote it to primary.
- No new dependencies.
