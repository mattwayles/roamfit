## Track: 26 — Set-feedback modal over the rest screen
Last updated: 2026-10-03
### Done
- [x] migration 0025, schema, users repo (+test), Settings toggle (+test), WorkoutScreen `Sheet`
  over the rest page (+ `WorkoutScreen.feedbackPrompt.test.tsx`); committed in the track-26 commit
### In progress
- Nothing.
### Next
- Device pass (see BACKLOG): does the sheet feel right over the ring, is it too naggy per set.
### Decisions / gotchas
- Modal opens only for a *completed* set (skips never rest, so never ask). Opened in
  `commitSetAndRest`, not derived from `phase`, so resuming a persisted rest never re-prompts.
- Rest timer starts as the rest page mounts; the modal simply overlays it (no timer pause).
- Modal on → the inline "How did that set feel?" is hidden; modal off → inline as before.
- Default on. Not built (suggestions only): prompt only on an exercise's last set, or only after N
  unanswered, etc.
