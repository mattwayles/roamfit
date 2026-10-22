## Track: 44 — Badges page redesign

Last updated: 2026-10-21

### Done

- [x] 44a engine `hint` + catalog hints + test — ce92cc9
- [x] 44a BadgeEmblem `showProgress` arc (grid + Almost there) — 1033d01
- [x] 44a sheet: Earned during link, Share (text), series Pips + prev/next, locked hint,
      BACKLOG image-share item — 9689f22

### In progress

- 44b: start in `app/src/lib/badges.ts` — add a pure `buildSeriesTrails(sections)` view model
  (one trail per series: nodes in tier order, current node = first locked, singles split out per
  category) with tests; then `app/src/components/BadgeTrail.tsx` and swap the flat grid in
  `BadgesScreen.tsx`; hero header last.

### Next

- 44b: series "trail" rows replacing the flat grid (one row per series, nodes on a path, partial
  ring on the current node, tap opens a series sheet with every tier on a vertical trail with
  dates; one-off badges in a compact "Singles" grid per category) + hero header (newest badge
  featured, per-category patches with counts that scroll to the section, tier tally).
- 44c: delight pass — unseen badges "stitch in" on first view with expo-haptics success; haptic
  tick on press; tilt-to-sheen on the 120px sheet emblem (Animated + PanResponder) for
  gold/summit; soft shimmer on earned summit emblems. All motion off under Reduce Motion.
- 44d: Collection | Timeline toggle (month-grouped earned badges from shelf.recent, linked
  workout) + riddle hints for hidden badges with "N of M secrets found"; smarter Almost there
  (progress bar; "Within reach today" label + one-tap into Generate with a suggested setting —
  the engine still selects exercises); one-line category intros under each section eyebrow.

### Decisions / gotchas

- Sheet helpers live in `lib/badges.ts` (`seriesContext`, `earnedDuringLabel`); the sheet's emblem
  also passes `showProgress` (a locked badge shows its arc at 120px). `EarnedDuring` in
  BadgesScreen reads `sessionsRepo.getCompletedSessionDetail` + `buildSessionHistoryView`.
- Progress arc uses per-category stroke perimeters (`PERIMETER` in BadgeEmblem) with a dasharray,
  because react-native-svg's `pathLength` is not reliable across shapes. Change a shape, update it.
- Jest: a second render in the same file after an async-heavy test hits a broken act environment;
  `BadgesScreen.session.test.tsx` is its own file for that reason.
- Hints: series-level `hint` on SeriesSpec; hidden badges have none (test enforces both ways).

- Design approved by the user; do not re-litigate. No reanimated: RN Animated only.
- Image share (react-native-view-shot) needs a native rebuild: parked in BACKLOG, text share only.
- Commit bbd100b had removed the old "From your <date> workout" link; 44a deliberately
  reinstates it as an "Earned during" row, per the approved design.
- Invariant 4: progress is always neutral ("12 of 25"); hints are positive, never a deficit.
