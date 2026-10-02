## Track: 24 — Pine replaces ember as the primary accent
Last updated: 2026-10-02

Request (user feedback): keep the deep outdoor feel of Golden Hour / Daylight but stop using burnt-ember
orange as the primary color. Replace `ember` + `emberDeep` outright with a pine green, "shifted towards
fern" (hue ~138). Spotify-green proximity was discussed and explicitly accepted.

### Done
- [ ] 1. Behavior-neutral token rename `ember`→`pine`, `emberDeep`→`pineDeep`, gradient `sunrise`→`trail`
      (values unchanged, so tests pass untouched apart from names).

### In progress
- Step 1 rename across `app/src` (ts/tsx incl. tests) with word-boundary perl; then `npm run check`.

### Next
2. New values in `app/src/theme/palettes.ts` (see decisions) + update hex/rgba literals in
   `theme.test.ts` / `themes.test.ts`; `npm run check`.
3. Doc/comment sweep: leftover "ember"/"sunrise" prose, BACKLOG device-pass items that name `emberDeep`
   (Golden Hour redesign item 2), DESIGN.md mentions if any.
4. Park in BACKLOG: device pass (look at the greens on a simulator; Spotify button proximity; icon.png /
   splash-icon.png still orange?), and the theme-name question (below).

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
