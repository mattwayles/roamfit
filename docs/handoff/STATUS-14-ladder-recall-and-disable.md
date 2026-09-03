## Track: 14-ladder-recall-and-disable — Lower rungs stay eligible + explicit exercise disable
Last updated: 2026-09-02
Status: **Complete.** `npm run check` (typecheck + test + lint + engine-purity + library
validation) is green across all five workspaces as of commit `f3c633d`.

Origin: user request — once a ladder family advances, lower-rung exercises should stay in
rotation (weighted 60/40 toward the current rung, only down to level 1, no window) instead of
disappearing. Paired with an explicit, permanent per-exercise disable/enable toggle (Exercises
detail screen + workout approval screen), distinct from the existing temporary
`suppressedUntil`. Full design in the approved plan (this session; not persisted elsewhere).

User decisions (already implemented, do not re-litigate):
- 60/40 weighted pick between current rung and the union of all lower rungs, when both have
  eligible candidates — not "only fall back when current rung is exhausted."
- Lower rungs = every level below current, down to level 1. No window.
- Disabling from the approval screen swaps the exercise out of the session immediately (reuses
  `alternativesForSlot`).
- **Difficulty floor on the lower-rung pool only**: a `hard`-difficulty request admits medium/hard
  exercises, `medium` admits easy/medium, `easy` admits easy only — reuses `hardFilters.ts`'s
  `isDifficultyEligible` rather than a duplicate rule. Current-rung selection is unchanged
  (pre-existing behavior, out of scope). This is what keeps an easy-difficulty level-1 exercise
  from ever surfacing in a user-selected hard workout via the new lower-rung pool.

### Done — everything
- **Schema**: `exercise_state.disabled_at` (nullable, permanent user veto, distinct from
  `suppressed_until`) — migration `0012_exercise_disabled.sql` + embedded copy in
  `migrations/data.ts`.
- **Engine types/filters**: `ExerciseState.disabledAt`, `UserProfile.disabledExerciseIds`;
  `hardFilters.ts`'s `isUserEnabled` hard filter, wired through every real `applyHardFilters`/
  `alternativesForSlot` call site (`pipeline.ts`, `selection/swap.ts`, `levelUp.ts`,
  `ApprovalScreen.tsx`'s `handleSwap`/`candidatesFor`/`handleDisable`, `WorkoutScreen.tsx`'s
  mid-workout swap).
- **Repo layer**: `exerciseState.ts`'s `setDisabled`/`getDisabledExerciseIds`; `users.ts`'s
  `buildUserProfile` includes `disabledExerciseIds`; `exerciseCatalog.ts`'s
  `ExerciseCatalogState.disabled` for the list-screen badge.
- **Ladder lower-rung pooling** (`packages/engine/src/progression/`): `ladder.ts`'s
  `exercisesBelowLevel`; `constants.ts`'s `CURRENT_RUNG_WEIGHT = 0.6`; `resolveSlot.ts`'s
  `pickFromPool`/`pickLadderCandidate` implementing the current-vs-lower weighted draw, gated on
  the lower pool by `isDifficultyEligible`. `pickLadderCandidate` returns a three-way reason
  (`'current' | 'lower-weighted' | 'current-unavailable'`) so `resolveLadderSlot` can tag a
  deliberate variety pick as `ResolvedLadderSlot.pulledFromLevelId` and a hard-filter failure as
  the pre-existing `substitutedFrom` — these are NOT the same thing and must stay tagged
  differently (see Decisions below; this was a real bug caught by the 60/40 test). 
  `ResolveSlotInput.includeLowerRungs` (default true) lets `levelUpFamily` opt out, since it needs
  the newly-unlocked rung's own eligibility, not a mastered lower one.
- **UI**: `ExerciseDetailScreen.tsx` has a `Switch` toggle next to `PinnedNote`;
  `ExercisesScreen.tsx`'s `ExerciseCard` shows a "Disabled" badge (same slot as "No video");
  `ApprovalScreen.tsx`'s `EntryCard` has a third icon button (`onDisable`) that disables
  permanently and immediately swaps/removes the entry via `handleDisable`.
- **Tests**: `hardFilters.test.ts` (disable filter), `exerciseState.disabled.test.ts` (repo
  layer, 5 cases), `exerciseCatalog.test.ts` (catalog badge field), `resolveSlot.test.ts`'s new
  "lower-rung recall (track 14)" describe block (60/40 split over 400 seeded draws, the difficulty
  floor excluding an easy lower rung from a hard request, and the current-unavailable fallback),
  `ExerciseDetailScreen.test.tsx`/`ExercisesScreen.test.tsx`/`ApprovalScreen.disable.test.tsx` for
  the UI.

### Concurrent-session note (resolved, keep for future reference)
A peer session (`roamfit-5f`) was independently renaming the engine's session "effort"
(easy/normal/hard) to "difficulty" (easy/medium/hard, unified with `Exercise.difficulty`) in the
same working tree while this track's lower-rung logic was uncommitted. Both changesets landed
adapted together on disk; they were manually separated into two clean, independently green
commits: `c62b066` (the rename, plus two content/test fixes it exposed — a lateral_flexion
difficulty-coverage gap and a stale comeback-tier test date) and `3fd4c46` (this track's ladder
lower-rung pooling, rebased on top of the rename). If another concurrent-session collision
happens: stop, check `ListAgents`/`git status` for unexpected diffs, and ask before proceeding
rather than assuming a system note describing an unexpected file change is wrong.

### Next
Nothing outstanding for this track. If picking this up again for a related request:
- Manual/device verification was never done (no device available in this session) — run the app,
  disable an exercise from both screens, advance a ladder family and watch a lower rung recur
  over repeated generations, and confirm the hard-difficulty floor holds. Not blocking (unit/
  integration coverage is real), but per CLAUDE.md's UI-change rule this is the one gap.
- `docs/decisions/` has no ADR for this track — the project's convention per CLAUDE.md is that a
  requested change doesn't need justifying against a prior document, so none was written. If a
  future track needs to reference "why 60/40" or "why difficulty-gate only the lower pool," point
  at this file and `git log` for commits `9471c18`, `276b4a7`, `c62b066`, `3fd4c46`, `d572ea4`,
  `f3c633d`.

### Decisions / gotchas
- Do NOT conflate `disabledAt` with `suppressedUntil` — separate columns, separate concepts,
  separate call sites. `suppressedUntil` is unchanged (accessory-slot-only, system-managed,
  temporary).
- Micro-progression math keeps reading `exerciseForLevel(family, state.levelId, library)` (the
  anchor) regardless of which rung's sibling got programmed. `state.levelId` never changes from
  the lower-rung logic, in any branch.
- The difficulty floor applies ONLY to the lower-rung pool, never to the current rung's own
  `exercisesForLevel` set — pre-existing, unchanged behavior, deliberately left alone.
- **`pulledFromLevelId` vs `substitutedFrom` — do not merge these.** `pulledFromLevelId` means
  "the 60/40 draw deliberately chose a mastered lower rung; nothing is wrong." `substitutedFrom`
  means "the current rung's own exercises all failed a hard filter (anchor/injury/equipment); a
  lower rung stood in for it this session only." A caller building the §5.8 explanation line
  needs different copy for each — one is neutral/positive, the other should read like the
  pre-existing anchor-unavailable substitution notice. `pickLadderCandidate`'s three-way `reason`
  return (`'current' | 'lower-weighted' | 'current-unavailable'`) is what keeps them apart; don't
  collapse it back to a boolean.
- `UserProfile.disabledExerciseIds` and `ExerciseState.disabledAt` are required (non-optional)
  fields, matching this codebase's convention (e.g. `suppressedUntil` is required-but-nullable
  too) — every test fixture building one of these literals had to be updated when they were
  added; grep for `disabledExerciseIds`/`disabledAt` for the precedent if a new one is needed.
- No explanation-line copy was added for `pulledFromLevelId` (§5.8's `composeExplanation` was not
  touched) — the field exists and is correctly tagged, but nothing surfaces it in the session
  explanation text yet. Small, non-blocking follow-up if the user wants the recall called out.
