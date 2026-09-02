## Track: 12 — Exercises page (library browser + exercise detail)

Last updated: 2026-09-02

### Done
- [x] Increment 1 — `packages/store/src/repositories/exerciseCatalog.ts`:
  `getExerciseCatalogState(db)` (times completed + last performed + user/curated video presence,
  keyed by exercise id) and `getExercisePerformanceHistory(db, exerciseId)` (one point per
  *completed* session: sets completed, best reps/seconds, heaviest band actually used, total
  volume, rest/tempo), exported as `exerciseCatalogRepo`. 17 tests.

- [x] Increment 2 — `app/src/lib/exerciseCatalog.ts` (516b2b7): search, filters, A–Z ordering,
  filter vocabulary derived from the library. 35 tests.
- [x] Increment 3 — `app/src/lib/exerciseProgress.ts` (04fb50b): chart series + gain summary
  across best set / sets / volume / band. 17 tests.

- [x] Increment 4 — `ExercisesScreen` + `ExerciseDetailScreen` + both routes + the Home header
  link. 18 screen tests; `npm run check` green (1428 tests).

### In progress
- Nothing. The track is complete as specified.

### Next
- Only what feedback asks for. Candidates deliberately not built: saved filter presets, a
  library-wide "which exercises still need videos" count, and jump-to-letter on the list.

### Decisions / gotchas
- **"Times completed" is `exercise_state.sessions_performed`.** `completion.ts` only calls
  `recordExercisePerformed` when `summary.anyCompleted` — a session where the exercise was
  entirely skipped does not count. That is exactly the requested "completed in tracked workout
  history", so no new counter is added.
- **One video per exercise, two surfaces.** The detail page reuses `DemoMedia` and calls the same
  `exerciseStateRepo.assignUserVideo` / `clearUserVideo` the workout screen calls. No new column,
  no new field: `exercise_state.user_video_id` is already per user × exercise, so a video assigned
  from the catalogue renders inside an active workout automatically.
- **"Has a video" = user video OR curated remote-config video.** Both feed the media ladder, so
  "still needs a link" must mean neither. Curated ids stay remote-config only (invariant 8).
- **No new dependencies.** The progression chart is plain RN `View`s (bars), not a chart library.
- Never punish (invariant 4): the detail page badges *gains* only. A flat or lower series is shown
  as a neutral history, never as a loss, a red mark, or a "you've regressed" line.
- **This repo's `@testing-library/react-native` (14.0.1) has an async `render` and async
  `fireEvent`.** An un-awaited `fireEvent` has not dispatched by the time the next line asserts, so
  a state update looks like it never happened. Older test files here get away with it because they
  follow every event with `await waitFor`. New screen tests `await` both.
- The list is a `FlatList`, so only the first window of cards is mounted in a test — reach a
  specific exercise by searching for it first, the way a user would.
