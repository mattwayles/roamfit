## Track: 14-ladder-recall-and-disable — Lower rungs stay eligible + explicit exercise disable
Last updated: 2026-09-02

Origin: user request — once a ladder family advances, lower-rung exercises should stay in
rotation (weighted 60/40 toward the current rung, only down to level 1, no window) instead of
disappearing. Paired with an explicit, permanent per-exercise disable/enable toggle (Exercises
detail screen + workout approval screen), distinct from the existing temporary
`suppressedUntil`. Full design in the approved plan (this session; not persisted elsewhere).

User decisions already made (do not re-litigate):
- 60/40 weighted pick between current rung and the union of all lower rungs, when both have
  eligible candidates — not "only fall back when current rung is exhausted."
- Lower rungs = every level below current, down to level 1. No window.
- Disabling from the approval screen swaps the exercise out of the session immediately (reuses
  `alternativesForSlot`).
- **Difficulty floor on the lower-rung pool only**: a `hard`-difficulty request admits medium/hard
  exercises, `medium` admits easy/medium, `easy` admits easy only (this is exactly
  `hardFilters.ts`'s `isDifficultyEligible`, reused rather than duplicated — see the
  concurrent-session note below for why). Current-rung selection is unchanged (pre-existing
  behavior, out of scope). This exists so an easy-difficulty level-1 exercise can never surface in
  a user-selected hard workout via the new lower-rung pool.

### Done
- [x] Schema: `exercise_state.disabled_at` column + migration `0012_exercise_disabled.sql`
      (and embedded copy in `migrations/data.ts`) — nullable, permanent user veto, distinct from
      `suppressed_until`. `migrate.test.ts` byte-for-byte check passes.
- [x] `packages/engine/src/types.ts`: `ExerciseState.disabledAt`, `UserProfile.disabledExerciseIds`.
- [x] `packages/engine/src/filters/hardFilters.ts`: 4th hard filter `isUserEnabled`,
      `HardFilterInput.disabledExerciseIds`. Doc comment updated (three filters -> four).
- [x] Wired `disabledExerciseIds` through every real `applyHardFilters`/`alternativesForSlot`
      call site: `pipeline.ts` (both `pool` and `poolIgnoringEquipment`), `selection/swap.ts`
      (`SwapSlotRequest`), `app/src/screens/ApprovalScreen.tsx` (`handleSwap` + `candidatesFor`),
      `app/src/screens/WorkoutScreen.tsx` (mid-workout swap).
- [x] Updated every test fixture that constructs a `UserProfile`/`ExerciseState`/`SwapSlotRequest`
      literal across `packages/engine/src` to carry the new required fields (grep for
      `disabledExerciseIds`/`disabledAt` to find them all if more turn up).
- [x] New `hardFilters.test.ts` cases: disabling removes an exercise regardless of other filters;
      an empty disabled set doesn't change anything.
- [x] `npm run test` (packages/engine) and `packages/store`'s `migrate.test.ts` green.
- [x] Repo layer: `exerciseState.ts` — `rowToState` maps `disabledAt`; added
      `setDisabled(db, exerciseId, disabled, now)` and `getDisabledExerciseIds(db): string[]`.
      `users.ts`'s `buildUserProfile` now includes `disabledExerciseIds`. Also fixed a call site
      the earlier grep missed: `packages/store/src/levelUp.ts`'s own `applyHardFilters` call.
      New test file `exerciseState.disabled.test.ts` (5 cases, following the
      `exerciseState.userVideo.test.ts` naming/pattern convention).
- [x] Full `npm run check` green (engine 966, store 159 incl. the 5 new, app 298, data 5,
      functions 29 — all passing; a `npm run check` app-workspace "Lifecycle script test failed"
      was jest's known non-zero exit from a pre-existing "worker process failed to exit
      gracefully" warning, unrelated to this change — re-running `npx jest` directly in `app/`
      shows all 298 tests passed).

### In progress
- Next action: the UI half (step 2 below). Ladder pooling logic is done and committed.

### Concurrent-session note (resolved)
A peer session (`roamfit-5f`) was independently renaming the engine's session "effort"
(easy/normal/hard) to "difficulty" (easy/medium/hard, unified with `Exercise.difficulty`) in the
same working tree while this track's lower-rung logic was uncommitted. Both changesets landed
adapted together on disk; they were then manually separated back into two clean, independently
green commits: `c62b066` (the rename, plus two content/test fixes it exposed — a lateral_flexion
difficulty-coverage gap and a stale comeback-tier test date) and `3fd4c46` (this track's ladder
lower-rung pooling, rebased on top of the rename). `isDifficultyEligibleForEffort` from the
original plan was dropped in favor of reusing the rename's own canonical `isDifficultyEligible`
(in `hardFilters.ts`) — same rule, no duplicate logic. If another concurrent-session collision
happens again: stop, check `ListAgents`/`git status` for unexpected diffs, and ask before
proceeding rather than assuming a note describing an unexpected file change is wrong.

### Next
1. **Ladder lower-rung pooling — DONE** (commit `3fd4c46`). `ladder.ts` has
   `exercisesBelowLevel`; `constants.ts` has `CURRENT_RUNG_WEIGHT = 0.6`; `resolveSlot.ts` has
   `pickFromPool`/`pickLadderCandidate`/the current-vs-lower 60/40 draw gated by
   `isDifficultyEligible` on the lower pool only, and `ResolvedLadderSlot.pulledFromLevelId` for
   the deliberate-lower-rung-pick case (distinct from `substitutedFrom`'s hard-filter-failure
   case). `ResolveSlotInput.includeLowerRungs` (default true) lets `levelUpFamily` opt out.
   Still owed, not blocking: dedicated new tests for the 60/40 split and the difficulty floor
   (the existing `resolveSlot.test.ts` cases were adapted with `includeLowerRungs: false` to keep
   testing single-level/walk-down behavior in isolation, but nothing yet directly asserts the new
   blended behavior itself — worth adding before calling this track fully verified).
2. **UI**:
   - `ExerciseDetailScreen.tsx`: `handleToggleDisabled` next to `handleAssignVideo`/
     `handlePinnedNoteChange`; toggle rendered near `PinnedNote`.
   - `ExercisesScreen.tsx`: `ExerciseCard` gets a "Disabled" badge (same slot as the "No video"
     tag), sourced from the catalog-state query extended to carry `disabledAt`.
   - `ApprovalScreen.tsx`: `handleDisable(entry)` near `handleRemove`/`handleSwap` — writes
     `disabledAt`, then re-runs the `alternativesForSlot` swap (profile must be re-read from db
     after the write so the just-disabled id is actually excluded); falls back to `handleRemove`'s
     no-alternative messaging if nothing survives. `EntryCard` gets a third icon button
     (`onDisable`) in `cardActions` next to `onSwap`/`onRemove`.
3. Manual/device verification per the plan's Verification section (disable from both screens,
   confirm exclusion; confirm lower-rung recall + weighting qualitatively; confirm the hard-effort
   difficulty floor).
4. Delete this status file's originating BACKLOG-adjacent notes (there are none — this was a
   direct request, no backlog entry to remove) once the track is fully done and `npm run check`
   is green end to end.

### Decisions / gotchas
- Do NOT conflate `disabledAt` with `suppressedUntil` — they're separate columns, separate
  concepts, separate call sites. `suppressedUntil` stays exactly as-is (accessory-slot-only,
  system-managed, temporary).
- Micro-progression math must keep reading `exerciseForLevel(family, state.levelId, library)`
  (the anchor) regardless of which rung's sibling got programmed — this was already true before
  this track and must stay true. `state.levelId` never changes from the new lower-rung logic.
- The difficulty floor applies ONLY to the newly-introduced lower-rung pool, never to the current
  rung's own `exercisesForLevel` set — that's pre-existing, unchanged behavior, deliberately left
  alone per the approved plan.
- `UserProfile.disabledExerciseIds` and `ExerciseState.disabledAt` were added as required
  (non-optional) fields, matching this codebase's existing convention (e.g. `suppressedUntil` is
  required-but-nullable too) — every test fixture across `packages/engine/src` that builds one of
  these literals had to be updated; grep for `disabledExerciseIds`/`disabledAt` to find the
  precedent if a new test file needs one.
