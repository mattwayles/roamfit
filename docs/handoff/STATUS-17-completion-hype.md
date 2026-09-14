## Track: 17 — Completion screen hype (level-ups folded in)
Last updated: 2026-09-14 (increment complete)
### Done
- [x] Level-ups folded into the completion screen + full hype pass (0f9a1ee "Completion
  screen: fold level-ups in, add hype choreography"). `npm run check` green.
### In progress
- nothing
### Next
- Device run owed: none of the feel (shake strength, confetti density, sound loudness of
  `level-up.wav`, orb opacity) can be judged under Jest. Tune constants in
  `lib/completionTimeline.ts`, `ConfettiBurst.tsx`, `CelebrationBackdrop.tsx` after seeing it.
### Decisions / gotchas
- No `react-native-reanimated`/svg/gesture-handler: they need a dev-client rebuild. Everything
  here is the built-in `Animated` API. The BACKLOG item for that tier stays open.
- Reveal order is deliberate: headline slam → confetti cannons → stats count up → level-up
  cards one at a time (each its own sound/haptic/confetti pop) → "Heck yes!" button.
- Reduce Motion (iOS setting) turns off screen shake and the continuous loops, not the confetti.
