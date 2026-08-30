## Track: 3-persistence — SQLite persistence + session lifecycle
Last updated: 2026-08-30

### Done
- [x] Read wave-03 brief, ORCHESTRATION carried-forward issues, STATUS-2-engine, ADRs 0001/0002,
  engine's `index.ts`/`types.ts`, and spec §4.3-4.7, §8.1-8.3, §9.1/9.3/9.9, §10.9/10.10,
  §11.1/11.3, §12.
- [x] **ADR 0003 written** (`docs/decisions/0003-store-package-and-sqlite-driver.md`): `packages/store/`,
  pure TS, Drizzle schema shared between `drizzle-orm/better-sqlite3` (node tests, in-memory) and
  `drizzle-orm/op-sqlite` (device, wired later from `app/src/db/` — not this package's job).
  Confirmed both drivers exist at pinned `drizzle-orm@0.45.2` and accept an identical
  `sqlite-core` schema.
- [x] `packages/store/` scaffolded: `package.json`, `tsconfig.json`, `jest.config.js`; added to
  root `package.json` workspaces array.
- [x] Engine wiring surface exported (`packages/engine/src/index.ts`): `applySessionResult` +
  `ProgressionEvent`/`ApplySessionResult`/`SessionPerformance` (§6.3/§6.7, called at completion),
  `assessComeback`/`applyComebackToProgressionStates` + `ComebackAssessment`/`ComebackTier`
  (§9.4/§9.9), `COMEBACK_VOLUME_MULTIPLIER`/`COMEBACK_WEEK_GAP_DAYS`. These were previously
  internal to `pipeline.ts` only. Additive only — no engine logic changed.
  `npm run typecheck --workspace packages/engine` confirmed green after the change.

### Decisions / gotchas (read before continuing)
- **§9.9 Recovery Week wiring plan** (not yet implemented): `pipeline.ts`'s own comeback
  assessment is entirely internal — it derives gap-tier from `userState.history` and cannot be
  told "treat this as a week-gap comeback" directly; its own comment says this override is
  "layered on by a future wave" (us). Plan, to avoid any parallel reimplementation of the state
  transition itself:
  1. Store computes `applyComebackToProgressionStates(progressionStates, families, library,
     'week')` itself — the exact function §9.4 uses, per the brief's explicit requirement — and
     passes the *already-regressed* states in as `userState.progressionStates` to
     `generateSession`. Since the real gap is normally small for a Recovery Week user, the
     pipeline's internal `assessComeback` will itself resolve `tier: 'none'` and pass the caller's
     `progressionStates` through unchanged — i.e. our pre-transform survives untouched, and there
     is no double-application.
  2. The ~20% volume cut (`COMEBACK_VOLUME_MULTIPLIER`) is *not* reachable this way — it's applied
     inside `generateSession`'s own prescription call, gated on its own internal
     `assessComeback` result, not on the caller-supplied states. There is no `GenerationRequest`
     field to force it. Plan: apply the same multiplier as a **post-generation pass over the
     returned `SessionPlan`** in the store layer — multiply each entry's `sets` by
     `COMEBACK_VOLUME_MULTIPLIER` and floor at 1, mirroring what `prescribe.ts` does internally.
     This is a deliberate, minimal (~3 line) exception to "don't reimplement engine logic in the
     store" — flagged here explicitly per CLAUDE.md rather than done silently. If a future reviewer
     wants this pushed into the engine as a real `GenerationRequest.forceComebackTier` field
     instead, that's a small, low-risk engine change — not done yet because the brief says not to
     touch the engine beyond explicit wiring, and this doesn't require it.
  3. Recovery Week milestone (§9.9: "Counts toward weekly target as normal... logged as a
     milestone") — mark the resulting session row with a `recovery_week: true` flag and write a
     `milestones` row of `type: 'recovery_week'` at completion, not at generation.
- Single-pending-session enforcement (§10.10) plan: `sessions.pending_slot` nullable INTEGER,
  application code sets it to `1` whenever `status IN ('planned','active')` and clears it to
  `NULL` on completion/discard; a partial unique index
  `CREATE UNIQUE INDEX ux_sessions_pending_slot ON sessions(pending_slot) WHERE pending_slot = 1`
  makes a second concurrent pending session a DB-level constraint violation, not just an
  application check — belt and suspenders. Not yet implemented.
- Planned-vs-actual plan: `session_entries` carries an immutable `planned_exercise_id` (set once
  at creation) *and* a mutable `exercise_id` (starts equal, updated on a user-driven mid-workout
  swap). A separate `signal_events` table logs the swap event itself (from/to/at-set-index) for
  §8.3 analytics. Approval-time removals: entries get an `entry_status` of
  `'planned' | 'removed_at_approval' | 'unplanned_added'` rather than being deleted, so nothing
  ever destroys the original plan record — satisfies both the done-criterion and §8.3's
  "exercises removed at approval" / "sets added or deleted at approval" signals structurally, not
  just via a log line.
- Crash safety plan: every `set_log` write (`logSet`) is its own committed transaction — resuming
  after a force-quit reconstructs "which set was in progress" purely by querying which
  `set_logs` rows exist for the active session's entries, no separate "cursor" state to go stale.

### In progress
- Nothing landed yet beyond scaffolding + engine export wiring (committed separately, see next
  commit). About to write `packages/store/src/schema.ts` (Drizzle sqlite-core schema for
  §4.3-4.7 + rolled-up stats + `signal_events` + `deferred_work` queue + `milestones`), then
  `src/migrations/0001_init.sql` + `src/migrate.ts` + `src/testHarness.ts` (better-sqlite3
  in-memory, migrated fresh per test).

### Next
1. `schema.ts` + first migration + migration runner + test harness. Get one trivial
   round-trip test green (`npm run test --workspace packages/store`) before building repositories.
2. `src/dates.ts` — `local_date`/`tz_id` helpers built on top of the engine's exported
   `daysBetween`/`addDays`; the flying-east pinned test belongs here.
3. Repositories: users, exercise_state, progression_state, sessions (lifecycle + set logging +
   crash-safe resume), signals, stats (incremental rollups), queues (deferred work), milestones.
4. `completion.ts` — the one transaction wiring `applySessionResult` per laddered family present
   in the session, exercise-state EMA updates, rolled-up stats updates, milestone rows, and
   enqueuing (never awaiting) LLM distillation / HealthKit / passport geocode.
5. Recovery Week entry point per the plan above.
6. Five-session scripted integration test (the wave's headline done-criterion), force-quit/resume
   test, single-pending-session test, one test per §8.3 signal, `local_date`/travel-day test.
7. Update this file, then `npm run check` at each commit boundary.

### §8.3 signal → storage path checklist (fill in as each is proven by a test)
- [ ] reps/seconds vs prescribed per set — `set_logs.reps_actual/seconds_actual` vs
  `session_entries.rep_target/duration_sec`
- [ ] set status completed/skipped/not_reached — `set_logs.status`
- [ ] time-under-set — `set_logs.started_at/completed_at`
- [ ] best-set improvement — `exercise_state.best_set_*` compared at completion
- [ ] rest taken vs prescribed + `+15s` tap count — `set_logs.rest_taken_sec`, `rest_extended_count`
- [ ] pause count/duration — `set_logs.pause_count`/`paused_duration_sec`
- [ ] session duration vs estimate — `sessions.actual_minutes` vs `estimated_minutes`
- [ ] exercises removed at approval — `session_entries.entry_status = 'removed_at_approval'`
- [ ] mid-workout swaps (what→what, at which set) — `signal_events` type `swap`
- [ ] sets added/deleted at approval — `session_entries.entry_status`, `signal_events`
- [ ] regenerate taps + consecutive count — `signal_events` type `regenerate`
- [ ] demo-media expansions — `signal_events` type `demo_media_expanded`
- [ ] pinned-note create/edit — `exercise_state.pinned_note` + `signal_events`
- [ ] abandonment point (exercise+set) — `sessions.abandoned_entry_id/abandoned_set_index`
- [ ] time of day / day of week — derivable from `sessions.utc_instant` + `tz_id`; consider a
  stored column if query ergonomics need it
- [ ] days since last session — derived from `rolled_up_stats.last_session_local_date`
- [ ] device timezone change → travel detection — `signal_events` type `tz_change`
