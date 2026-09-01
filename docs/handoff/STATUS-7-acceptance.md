## Track: 7-acceptance — Airplane-mode acceptance gate + instrumentation + polish
Last updated: 2026-09-01

### Ramp-up notes
- HEAD at start: `3a87416`, tree clean, `npm run check` green (app 87, engine 897, data 17,
  store 93, functions 29 tests; 0 lint errors, 2 fixable warnings; engine purity OK).
- Environment has a real booted iOS Simulator (`iPhone 17 Pro`, iOS 26.5) with the app already
  built and installed (`com.roamfit.app`), plus a real network-connected Bash shell — more
  device-level verification is possible here than prior waves assumed. No physical device.
- Read ORCHESTRATION.md in full (carried-forward table + verification log), wave-07 brief, spec
  §11.6/§13.3/§13.5/§12/§15 (not the full spec).
- Surveyed existing Jest coverage before writing anything new, to avoid duplicating what's
  already proven (cold-start dashboard, mastery/Next-Unlock, comeback tiers 7/21-day, hard-filter
  safety sweep incl. bodyweight_bearing cap, swap-alternatives anchor gating, crash-safety mid-
  session via `createFileTestDb` — issue #10 already effectively closed by `lifecycle.test.ts`,
  just not marked in the table). Net-new work targets genuine gaps: a literal §11.6 multi-day
  integration harness, completion-transaction atomicity under a forced mid-transaction throw,
  §15 instrumentation (didn't exist at all), a Settings screen (didn't exist at all — closes
  §13.3's "permanently in settings" + issues #20/#37), and real simulator evidence.

### Done
- [x] `packages/store/src/acceptanceGate.test.ts` — literal §11.6 harness: cold-start coherence,
  then 5 sessions across exactly 3 distinct local dates (two same-day, which the pre-existing
  wave-3 `simulation.test.ts` never exercised — it spread 5 sessions one-per-day over 9 days).
  Verifies generate/approve(edit)/run/complete/log/progression/exercise-state/stats/passport-
  queue all behave, and same-day sessions don't collapse or double-count. Mutation-verified: I
  temporarily gated off the passport-queue enqueue in `completion.ts` and reran — the test went
  red (`Expected length: 5, Received length: 0`) — then reverted. Honest scope note is in the
  file's own header: this proves the gate at the store/engine level (genuinely zero network,
  by construction — nothing here is even async), NOT that a real device with airplane mode on
  behaves this way. That gap is still open — see "What a human must still do" in the final report.
- [x] `packages/store/src/completion.test.ts` — new "kill during the completion transaction"
  test. Forces a real throw (via `jest.spyOn(statsRepo, 'recordSessionCompletion')`) strictly
  after per-entry exercise-state/best_set_pr writes have already executed against the live
  transaction connection, then asserts the session is still pending, zero milestones exist, and
  `getStats` is still null — proving `completeSession`'s single `db.transaction(...)` wrapper
  actually rolls back everything, not just the statement that threw. Addresses the wave brief's
  "force-quit... during the completion transaction specifically."
- `npm run check` green after both (app 87, engine 897, data 17, store 96, functions 29).

- [x] `packages/store/src/repositories/instrumentation.ts` (+ `.test.ts`, 12 tests) — §15 local-
  first instrumentation. All local reads, zero network, computed on demand (no batching/buffering
  daemon to keep alive, no wire protocol). Covers every §15 bullet:
  - Funnel (generate/started/completed + both drop-off stages) and estimate-accuracy/completion-
    by-length were fully derivable from existing `sessions` columns — no new writes needed.
  - Swap/removal-rate-per-exercise and video-flag-rate were already tracked as running counters
    on `exercise_state` for other reasons (§4.4) — this just ranks them.
  - Superset-pair completion reads the existing `session_entries.group` (A1/A2) column.
  - Abandon point reads `discardSession`'s existing `abandonedEntryId`/`abandonedSetIndex`.
  - Explicit feedback capture rate reads `difficultyFeedback`/`enjoymentFeedback`.
  - **Offline share was the one true gap** — nothing recorded connectivity at generation time.
    Added a `session_generated` signal-event type (schema.ts, no migration needed — signal_events
    .type has no SQL CHECK constraint) logged by `generate()` when the caller supplies a fresh
    `online` reading; wired into `GenerateScreen.tsx` via a best-effort background
    `getNetworkStatus()` call on mount (never awaited on the generate path — stays `undefined`,
    and nothing is logged, until it resolves, which is honest under invariant 1).
  - Activation and D1/D7/D30 retention approximate "install" as the user row's `createdAt` (this
    app has no real OS install timestamp available) — documented as an approximation in the file.
  - No new UI surface yet (see "Next" — a diagnostics read in Settings is still owed).
- `npm run check` green (app 87, engine 897, data 17, store 108, functions 29; 0 lint errors).

- [x] Settings screen + first-launch disclaimer gate + closed #20/#37, shas TBD at final commit:
  - `app/src/screens/SettingsScreen.tsx` (new) — permanent §13.3 disclaimer text, §13.5 privacy
    copy (location opt-in/city-level, health-write-never-read, freeform-text-is-user-content),
    an Apple Health write toggle (issue #37 — the store patch already existed, there was simply
    no UI), a notification quiet-hours on/off toggle (issue #20 — same shape: real column, no
    UI), and a read-only §15 diagnostics panel (`instrumentationRepo
    .computeInstrumentationSnapshot`, purely local).
  - **Quiet-hours toggle is on/off only, not a custom-hours picker** — a deliberate scope cut,
    not a silent gap. `clampToQuietHours(hour, enabled=true)` in `motivationNotifications.ts`
    takes the flag; `HomeScreen.tsx` passes `user.notificationPrefs.quietHoursEnabled` through.
  - First-launch disclaimer: migration `0007_disclaimer.sql` adds `users
    .has_acknowledged_disclaimer` (no CHECK constraints elsewhere in this table, straightforward
    `ALTER TABLE`). `HomeScreen.tsx` blocks on it before rendering anything else when false;
    `usersRepo.acknowledgeDisclaimer` flips it one-way. Verified the migration sync test
    (`migrate.test.ts`, an existing byte-for-byte `.sql`-vs-`data.ts` check) catches a drifted
    copy — it did, on the first attempt, and was fixed to match exactly.
  - `usersRepo.updateUser`'s `notificationPrefs` patch is a shallow merge, not a replace (a
    settings screen writing one field must not clobber others). Mutation-verified in the new
    `users.test.ts`: reverting the merge to `JSON.stringify({...patch.notificationPrefs})` (no
    spread of `current.notificationPrefs`) failed both new tests; reverted back to the merge.
  - Real regression this surfaced: 4 existing HomeScreen RNTL tests broke because a genuinely
    cold test db now hits the disclaimer gate — fixed by pre-acknowledging in the 3 tests where
    the gate isn't the point, and by actually tapping through it (real `fireEvent.press`) in
    `HomeScreen.dashboard.test.tsx`, which is arguably a better test of the gate than a
    dedicated unit test would have been.
- `npm run check` green throughout (app 87, engine 897, data 17, store 112, functions 29).

### In progress
- Real simulator pass next.

### Next
- Real simulator pass: boot evidence, cold-start-no-network check, screenshot.
- Carried-forward issue triage and final report.

### Decisions / gotchas
- (filled in as they arise)
