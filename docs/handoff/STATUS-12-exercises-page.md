## Track: 12 — Exercises page (library browser + exercise detail)

Last updated: 2026-09-02

### Done
- [x] Increment 1 — `packages/store/src/repositories/exerciseCatalog.ts`:
  `getExerciseCatalogState(db)` (times completed + last performed + user/curated video presence,
  keyed by exercise id) and `getExercisePerformanceHistory(db, exerciseId)` (one point per
  *completed* session: sets completed, best reps/seconds, heaviest band actually used, total
  volume, rest/tempo), exported as `exerciseCatalogRepo`. 17 tests.

### In progress
- Increment 2: `app/src/lib/exerciseCatalog.ts` — pure search + filter + alphabetical sort, with
  the filter-dimension vocabulary derived from the library itself. Tests alongside.

### Next
1. Increment 3 — `app/src/lib/exerciseProgress.ts`: pure series + first-vs-latest gain summary
   (best set, sets, total volume, band). Tests alongside.
2. Increment 4 — `ExercisesScreen` + nav route + Home entry point. Tests.
3. Increment 5 — `ExerciseDetailScreen` (all fields, How to, `DemoMedia`, progression chart). Tests.

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
