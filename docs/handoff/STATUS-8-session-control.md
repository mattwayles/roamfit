## Track: 8-session-control — abandon / reorder / pause three user-requested fixes
Last updated: 2026-09-01

### Read before starting
CLAUDE.md, ORCHESTRATION.md status board + carried-forward #6/#8/#10/#13/#14/#18 + verification
log, spec §8.3/§9.2/§9.4/§10.2-§10.10, STATUS-4-loop.md, STATUS-4b-loop-completion.md (pause bug
+ chained-useEffect completion-hang bug in `TimedExercise`, and the `estimatedSec` double-count
bug fixed in `c7453b9`).

### Plan (recorded before writing code, per interruption protocol)
1. **Store**: `packages/store/src/repositories/sessions.ts` gets `reorderEntriesAtApproval` (new
   §10.3 store mutation, section-scoped reassignment of existing `orderIndex` slots — never
   crosses section boundaries) + a new `reorder_at_approval` signal-event type (no migration
   needed, `signal_events.type` is plain TEXT per its own file comment). Tests in
   `lifecycle.test.ts` written to fail against the pre-fix behavior first (cross-section reorder
   rejected, in-section reorder persists and round-trips through `getSession`).
2. **App — reorder UI**: `ApprovalScreen.tsx` gets per-entry ▲/▼ buttons, section-scoped (no new
   dependency — button-based, not a drag library). Calls `reorderEntriesAtApproval`. New
   `ApprovalScreen.reorder.test.tsx` proves the round trip: reorder at Approval -> START ->
   WorkoutScreen's `findCurrent()` lands on the exercise the user put first, not the engine's
   original order.
3. **App — abandon**: reuse `sessionsRepo.discardSession` (already exists, already logs the
   §8.3 `abandoned` signal with `abandonedEntryId`/`abandonedSetIndex` — no store change). New
   shared `app/src/components/AbandonSessionButton.tsx` (two-step: tap -> inline confirm ->
   discard, neutral copy, no guilt language per invariant 4) wired into HomeScreen (resume card),
   ApprovalScreen, and WorkoutScreen. All three route to `Generate` (pickers, not a re-run) after
   discarding. Tests written to fail first: a single tap alone must NOT discard; discarding must
   clear the pending slot (`getPendingSession` -> null) and leave no orphaned active/planned
   session row.
4. **App — pause & navigate away**: `WorkoutScreen.tsx` gets a workout-level "Pause" action
   (distinct from the existing per-set `pause-resume-timer` §10.5 control). On press: sets a
   `paused` state that unmounts the active phase subtree (`TimedExercise`/`RepsExercise`/
   `RestPhase`) synchronously *before* the nav transition can run another tick, then navigates to
   Home. Unmounting is what actually stops cues/notifications (their existing `useEffect`
   cleanups already do this — confirmed by reading, not assumed) and prevents a stray
   `logSet`/`onComplete` firing during the (non-instant) screen-transition animation window.
   Elapsed-workout-timer bug fixed as part of this: it was a component-local `useRef` stopwatch
   that silently reset to ~0 on remount (i.e. every pause/resume cycle) — replaced with a
   derivation from the already-persisted `session.startedAt` (no new persistence), which is
   correct across an unmount/remount because it doesn't depend on any React-local state surviving.
   Test written to fail first: mount WorkoutScreen with a `startedAt` several minutes in the past
   and assert the elapsed text reflects that immediately on first mount (the old ref-based version
   would show ~0s).

### Done
- [x] Ramp-up complete, plan above written before any code.
- [x] **Step 1 (store) — `9009e22`.** `reorderEntriesAtApproval` in
  `packages/store/src/repositories/sessions.ts`, `reorder_at_approval` signal type in
  `schema.ts`. Section-scoped: permutes only the `orderIndex` slots the section's own active
  entries already hold, refuses (no-op) a wrong-length/cross-section/duplicate id list. Three new
  tests in `lifecycle.test.ts`. Mutation-verified: removing the permutation-validity guard fails
  the cross-section test (asserted `orderIndex` stayed put, got moved instead).
- [x] **Step 2 (app — reorder UI) — pending commit.** `ApprovalScreen.tsx` gets per-entry ▲/▼
  buttons (`move-up-<exerciseId>`/`move-down-<exerciseId>`), section-scoped, boundary-disabled.
  New `ApprovalScreen.reorder.test.tsx` proves the full round trip: reorder at Approval -> START
  -> render the real `WorkoutScreen` -> the exercise it lands on (after fast-forwarding warmup)
  is the one the user moved to first, not the engine's original pick. Mutation-verified: removing
  the `reorderEntriesAtApproval` call from `handleMoveEntry` (leaving only `reload()`) fails this
  test.
  - **Test-writing gotcha for whoever continues this file**: `render()` from
    `@testing-library/react-native` v14 is `async` (must be awaited to get a real result object
    with `.unmount()` — carried-forward issue #6's actual root cause per STATUS-4-loop.md).
    Mock navigation objects (`{navigate: jest.fn(), replace: jest.fn(), ...}`) don't actually
    unmount the previous screen the way real react-navigation does, so a round-trip test that
    renders screen A then screen B in the same test must explicitly call `(await
    render(...)).unmount()` on A first, or both trees stay mounted and text queries become
    ambiguous / the second screen's effects race the first's.

### In progress
- Next action: step 3 (abandon feature — shared confirm component + Home/Approval/Workout
  wiring).

### Decisions / gotchas
- No new dependencies. Reorder is button-based (▲/▼), not a drag library — sensible given the
  small per-section lists and the project's existing button-heavy interaction style at Approval.
- Pause is a *no-confirmation* action (distinct from Abandon, which always confirms) — pausing
  never destroys anything, so friction there would fight invariant 4 (never punish / no added
  friction on a blameless action).
- §8.3 signal for reorder: implemented (`reorder_at_approval`), consistent with the pattern
  already used for every other approval-time edit (`remove_at_approval`, etc.) in this file — not
  a scope cut.
