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

### In progress
- Moving to §15 instrumentation next.

### Next
- §15 instrumentation module + call-site wiring.
- Settings screen (disclaimer, privacy copy, HealthKit toggle, notification quiet hours) — closes
  §13.3's "permanently in settings" requirement plus issues #20/#37.
- Real simulator pass: boot evidence, cold-start-no-network check, screenshot.
- Carried-forward issue triage and final report.

### Decisions / gotchas
- (filled in as they arise)
