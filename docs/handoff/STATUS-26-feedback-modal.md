## Track: 26 — Set-feedback modal over the rest screen
Last updated: 2026-10-03
### Done
- [x] migration 0025, schema, users repo (+test), Settings toggle (+test), WorkoutScreen `Sheet`
  over the rest page (+ `WorkoutScreen.feedbackPrompt.test.tsx`); committed in the track-26 commit
### In progress
- (Increment 2 implemented; awaiting full-suite confirmation and commit.) Increment 2 (user chose idea #1): feedback is per EXERCISE, asked once after its last set
  ("How did those N sets of NAME feel?"). Storage returns to `session_entries.difficulty_feedback`
  (migration 0026 backfills it from legacy per-set values, worst-case); `set_logs.difficulty_feedback`
  becomes legacy/unwritten/unread; `recordSetFeedback` removed; `summarizeEntry` reads the entry
  column; Summary shows one chip per exercise (tap to edit) instead of per-set dots; inline fallback
  (toggle off) also appears only on the exercise's last-set rest.
### Next
- Device pass (see BACKLOG): does the sheet feel right over the ring.
### Decisions / gotchas
- (Superseded by increment 2: modal opens only after an exercise's final set.) Modal opens only for a *completed* set (skips never rest, so never ask). Opened in
  `commitSetAndRest`, not derived from `phase`, so resuming a persisted rest never re-prompts.
- Rest timer starts as the rest page mounts; the modal simply overlays it (no timer pause).
- Modal on → the inline "How did that set feel?" is hidden; modal off → inline as before.
- Default on. Not built (suggestions only): prompt only on an exercise's last set, or only after N
  unanswered, etc.
