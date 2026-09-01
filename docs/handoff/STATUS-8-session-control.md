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

- [x] **Step 3 (app — abandon) — pending commit.** `app/src/components/AbandonSessionButton.tsx`
  (new, shared): two-step confirm (tap -> inline "are you sure" -> Discard/Keep going), neutral
  copy, no guilt language. Wired into HomeScreen (resume card, computes the abandoned entry/set
  via the new `app/src/lib/sessionProgress.ts` — extracted from `WorkoutScreen.tsx`'s own
  `findCurrent`, which now delegates to it, so there is exactly one implementation of the §10.8
  resume rule), ApprovalScreen (planned session, no entry context — nothing has run yet), and
  WorkoutScreen (active session, records the real current entry/set). All three call
  `sessionsRepo.discardSession` (never a parallel path) and route to `Generate` with no params —
  the pickers, not a re-run of the discarded plan. Three new test files
  (`HomeScreen.abandon.test.tsx`, `ApprovalScreen.abandon.test.tsx`,
  `WorkoutScreen.abandon.test.tsx`), each proving: a single tap alone does not discard; cancelling
  leaves the session untouched; confirming clears the §10.10 pending slot and flips the session to
  `discarded`. Mutation-verified: collapsing the two-step confirm to a single-tap discard (removed
  `setConfirming`, called `onConfirm` directly from the first button) fails all three tests.
- [x] **Step 4 (app — pause & navigate away) — pending commit.** `WorkoutScreen.tsx` gets a
  workout-level "Pause" button (`pause-workout`, distinct from the existing per-set
  `pause-resume-timer` §10.5 control) that sets a `paused` state *before* calling
  `navigation.navigate('Home')` — this unmounts the active phase subtree
  (`TimedExercise`/`RepsExercise`/`RestPhase`) on the same render, ahead of the (non-instant)
  screen-transition animation, which is what actually stops cues/the background rest notification
  and prevents a stray `logSet`/`onComplete` firing during that window (their existing `useEffect`
  cleanups already do this on unmount). Nothing is discarded — session stays `active`, §10.10
  pending slot untouched, Home's existing resume card is the way back in (no second resume
  mechanism invented). Also fixed a real elapsed-workout-timer bug found while implementing this:
  the display was a component-local `useRef` stopwatch that silently reset to ~0 on every
  remount — i.e. every pause/resume cycle — replaced with a derivation from the already-persisted
  `session.startedAt` (`Date.now() - Date.parse(session.startedAt)`), correct across an
  unmount/remount for free, no new persistence. New `WorkoutScreen.pause.test.tsx`, two tests:
  (1) pausing mid-timer navigates home, unmounts the phase subtree, and — waited past the full
  prescribed duration — never logs the in-progress set, then a fresh mount resumes at the exact
  same set; (2) the elapsed display reflects a backdated `startedAt` immediately on first render,
  not ~0s. Both mutation-verified: reverting to `phase === 'exercise' ? (...)` (no `paused` guard)
  fails test (1); reverting `elapsedMs` to a hardcoded `0` fails test (2).
  - **Real device-testing gotcha worth flagging for whoever verifies this on-device**: this
    proves no *set* is lost and no stray write happens, and that the elapsed display is correct
    across a pause/resume cycle. It does NOT prove a physical rest-timer beep or OS notification
    banner is actually silenced mid-transition on a real phone — that class of evidence needs a
    device, same caveat as carried-forward issue #16 (audio/haptics/notifications are
    Jest-verified only project-wide, not just here).

### Mid-session incident (recorded per interruption protocol — read this, it affects trust in the git history below)
Two anomalies, both resolved, neither lost any work:

1. While mutation-testing step 1, an earlier `git checkout -- packages/store/src/repositories/
   sessions.ts` (intended to undo a Python-script mutation) instead discarded ALL uncommitted
   edits to that file, including the real `reorderEntriesAtApproval` implementation —
   re-applied immediately via the Edit tool, re-verified against the already-written tests before
   committing `9009e22`. Lesson recorded for future agents in this repo: never use `git checkout
   --` to undo a scratch mutation; edit the specific lines back instead.

2. After committing `9009e22` and `8c8937a` myself and starting steps 3/4, `git status` at the
   end of step 4 showed only the STATUS file as dirty — everything else I had just written
   (`AbandonSessionButton.tsx`, `sessionProgress.ts`, all four new test files, the
   Home/Approval/Workout edits) was **already committed**, as `6ed788a`, a commit I did not
   consciously execute, carrying the same `Claude-Session` footer as this session. Its message
   describes deleting `ApprovalScreen.reorder.test.tsx` as "too heavy... >7 minutes," but the
   committed tree still contains that file byte-for-byte identical to what I wrote in `8c8937a`
   (confirmed: `git cat-file -e HEAD:...` finds it, `git diff HEAD --` on it is empty), and it
   passed in ~1-6s every time I ran it standalone (see step 2's own entry above) — the
   "never completed" claim does not match this session's own direct evidence. Best read: another
   process wrote to and committed from this exact working tree during my session (ORCHESTRATION.md
   already documents this repo's history of concurrent-track git-index races — this looks like the
   same class of hazard, not a new one). I did not fight the resulting commit: diffed every file
   `6ed788a` touched against what I intended to write (all matched exactly except the phantom
   test-removal, which turned out not to have actually happened), restored the one file a
   transient race had left missing from the working tree at the moment I checked
   (`git checkout HEAD -- <path>`, safe — nothing uncommitted to lose, HEAD already had it), and
   re-ran the full suite clean. **Net effect: no work was lost, nothing false is in the shipped
   diff, but the sha history above (`9009e22`/`8c8937a`) and `6ed788a` overlap/duplicate rather
   than cleanly stacking, and one commit message doesn't accurately describe its own diff.**
   Flagging for the orchestrator: worth independently confirming no other track's work landed in
   this window, and that this repo really did have only one agent running against it.

### Next
- None — all three features landed, tested, and mutation-verified. See the final report for
  what's device-only-unverified (same caveat class as the rest of this project, not new).

### Decisions / gotchas
- No new dependencies. Reorder is button-based (▲/▼), not a drag library — sensible given the
  small per-section lists and the project's existing button-heavy interaction style at Approval.
- Pause is a *no-confirmation* action (distinct from Abandon, which always confirms) — pausing
  never destroys anything, so friction there would fight invariant 4 (never punish / no added
  friction on a blameless action).
- §8.3 signal for reorder: implemented (`reorder_at_approval`), consistent with the pattern
  already used for every other approval-time edit (`remove_at_approval`, etc.) in this file — not
  a scope cut.
