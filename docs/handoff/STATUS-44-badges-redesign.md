## Track: 44 — Badges page redesign
Last updated: 2026-10-21
### Done
- (nothing committed yet)
### In progress
- 44a: engine `hint` on BadgeDefinition/SeriesSpec + catalog hints (+ test); then BadgeEmblem
  progress arc (`progress` prop, `app/src/components/BadgeEmblem.tsx`); then the sheet in
  `app/src/screens/BadgesScreen.tsx` (Earned during, Share, series nav, hint).
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
- Design approved by the user; do not re-litigate. No reanimated: RN Animated only.
- Image share (react-native-view-shot) needs a native rebuild: parked in BACKLOG, text share only.
- Commit bbd100b had removed the old "From your <date> workout" link; 44a deliberately
  reinstates it as an "Earned during" row, per the approved design.
- Invariant 4: progress is always neutral ("12 of 25"); hints are positive, never a deficit.
