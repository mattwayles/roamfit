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
- **Difficulty floor on the lower-rung pool only**: `hard` effort admits medium/hard difficulty,
  `normal` admits easy/medium, `easy` admits easy only. Current-rung selection is unchanged
  (pre-existing behavior, out of scope). This exists so an easy-difficulty level-1 exercise can
  never surface in a user-selected hard workout via the new lower-rung pool.

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

### In progress
- Next action: repository layer (`packages/store/src/repositories/exerciseState.ts` +
  `users.ts`'s `buildUserProfile`) — step 2 of the plan. Not started yet.

### Next
1. **Repo layer**: `exerciseState.ts` — `rowToState` maps `disabledAt`; add
   `setDisabled(db, exerciseId, disabled, now)` (mirror `setSuppressedUntil`'s shape, using the
   existing `ensureRow` helper) and `getDisabledExerciseIds(db): string[]`. `users.ts`'s
   `buildUserProfile` adds `disabledExerciseIds: exerciseStateRepo.getDisabledExerciseIds(db)`.
2. **Ladder lower-rung pooling** (`packages/engine/src/progression/ladder.ts`,
   `constants.ts`, `resolveSlot.ts`):
   - `ladder.ts`: new `exercisesBelowLevel(family, levelId, library)`.
   - `constants.ts`: `CURRENT_RUNG_WEIGHT = 0.6`.
   - `resolveSlot.ts`: add `isDifficultyEligibleForEffort(difficulty, effort)` (strict floor per
     decisions above). Refactor `pickAtLevel` into `pickFromPool(candidates, filteredIds, rng,
     recentExerciseIds)` + a thin `pickAtLevel` wrapper (keeps the existing walk-down loop
     working unchanged). New `pickLadderCandidate(family, levelId, library, filteredIds, rng,
     recentExerciseIds, effort)` implementing the current/lower split + 60/40 weighted draw +
     difficulty floor on the lower pool only, per the plan's exact branch logic. `ResolveSlotInput`
     gains `effort: Effort`; `resolveLadderSlot` calls `pickLadderCandidate` instead of
     `pickAtLevel` for the initial attempt, passing `effort` (pipeline.ts already has `effort` in
     scope at its call site, ~L231, now shifted a couple lines by this session's edits — re-grep).
     `ResolvedLadderSlot` gets a new optional field (e.g. `pulledFromLevelId?: string`) set only
     when the 60/40 draw deliberately picks the lower pool (not the hard-filter-failure
     `substitutedFrom` case).
   - Engine tests: extend `resolveSlot.test.ts`/`ladder.test.ts` per the plan's verification
     section (60/40 split assertion via seeded rng, current-empty/lower-empty edges, difficulty
     floor table incl. the explicit "hard effort excludes easy level-1" case).
3. **UI**:
   - `ExerciseDetailScreen.tsx`: `handleToggleDisabled` next to `handleAssignVideo`/
     `handlePinnedNoteChange`; toggle rendered near `PinnedNote`.
   - `ExercisesScreen.tsx`: `ExerciseCard` gets a "Disabled" badge (same slot as the "No video"
     tag), sourced from the catalog-state query extended to carry `disabledAt`.
   - `ApprovalScreen.tsx`: `handleDisable(entry)` near `handleRemove`/`handleSwap` — writes
     `disabledAt`, then re-runs the `alternativesForSlot` swap (profile must be re-read from db
     after the write so the just-disabled id is actually excluded); falls back to `handleRemove`'s
     no-alternative messaging if nothing survives. `EntryCard` gets a third icon button
     (`onDisable`) in `cardActions` next to `onSwap`/`onRemove`.
4. Manual/device verification per the plan's Verification section (disable from both screens,
   confirm exclusion; confirm lower-rung recall + weighting qualitatively; confirm the hard-effort
   difficulty floor).
5. Delete this status file's originating BACKLOG-adjacent notes (there are none — this was a
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
