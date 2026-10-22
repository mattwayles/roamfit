## Track: 44 — Badges page redesign

Last updated: 2026-10-21

### Done

- [x] 44a engine `hint` + catalog hints + test — ce92cc9
- [x] 44a BadgeEmblem `showProgress` arc (grid + Almost there) — 1033d01
- [x] 44b view models `buildSeriesTrails` / `tierTally` + tests - see git log
- [x] 44b BadgeTrail, BadgesHero, BadgesScreen swap, tests - see git log
- [x] 44a sheet: Earned during link, Share (text), series Pips + prev/next, locked hint,
      BACKLOG image-share item — 9689f22

### In progress

- 44c: start with the "stitch in" for unseen badges. `BadgeEmblem` takes `showNew` today; add an
  `animateIn` prop (RN Animated scale/opacity, off under `useReduceMotion`) and a `haptics.success`
  on first view, driven from the `unseen` flags BadgesScreen already has on `shelf.recent`. Series
  trail nodes (`BadgeTrail`) and the hero emblem are where unseen badges now appear.

### Next

- (44b done) series "trail" rows replacing the flat grid (one row per series, nodes on a path, partial
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

- 44b: `BadgeEmblemSize` is now any number (trail nodes are 16-38px). One `Sheet` serves both the
  badge and the series views (a second Modal presented as the first dismisses can be dropped on
  iOS); from a trail the badge view gets "All in this series" back. NEW dots on trail rows
  (`trail-<series>-new`) and on the series sheet emblems replace the grid emblem dot; singles keep
  theirs. A series is a trail only if the shelf shows 2+ of its members (same rule as
  `seriesContext`). Trail strip sizes come from `trailNodeSizes(trail, width)` (earned emblems
  shrink to 16px floor, so 8 tiers fit with no horizontal scroll). Hero scroll-to-section uses
  `Screen`'s existing `scrollRef` plus each section's `onLayout` y.
- Test ids: `trail-<series>`, `trail-tier-<id>`, `badges-patch-<category>`, `badges-hero-*`,
  `badges-count` (now a single string child). Singles keep `badge-<id>`.
