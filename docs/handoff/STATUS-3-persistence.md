## Track: 3-persistence — SQLite persistence + session lifecycle
Last updated: 2026-08-30

### Status: all wave-03 done-criteria met. `npm run check` green (851 engine + 34 store tests).

### Done
- [x] Read wave-03 brief, ORCHESTRATION carried-forward issues, STATUS-2-engine, ADRs 0001/0002,
  engine's `index.ts`/`types.ts`, and spec §4.3-4.7, §8.1-8.3, §9.1/9.3/9.9, §10.9/10.10,
  §11.1/11.3, §12.
- [x] **ADR 0003** (`docs/decisions/0003-store-package-and-sqlite-driver.md`): `packages/store/`,
  pure TS, Drizzle schema shared between `drizzle-orm/better-sqlite3` (node tests, in-memory) and
  `drizzle-orm/op-sqlite` (device, wired later from `app/src/db/` — not this package's job).
- [x] `packages/store/` scaffolded and added to root workspaces; `package.json`/`tsconfig.json`/
  `jest.config.js` mirror `packages/engine`'s.
- [x] Engine wiring surface exported additively from `packages/engine/src/index.ts` (no engine
  logic changed, confirmed via `npm run typecheck --workspace packages/engine` at each step):
  `applySessionResult` + `ProgressionEvent`/`ApplySessionResult`/`SessionPerformance` (§6.3/§6.7),
  `assessComeback`/`applyComebackToProgressionStates` + `ComebackAssessment`/`ComebackTier`
  (§9.4/§9.9), `COMEBACK_VOLUME_MULTIPLIER`/`COMEBACK_WEEK_GAP_DAYS`,
  `calibrationStartLevel`/`defaultMicroForExercise` (§6.5 cold-start seeding).
- [x] **Schema** (`packages/store/src/schema.ts`) covering §4.3-4.7: `users`, `limitations`,
  `exercise_state` (per user × exercise, never on the library table — invariant 7),
  `progression_state` (per user × family, `level_id` stable — invariant 5), `sessions`,
  `session_entries` (`planned_exercise_id` immutable + `exercise_id` mutable, `entry_status` for
  approval edits), `set_logs`. Plus `signal_events` (§8.3 catch-all), `milestones`,
  `rolled_up_stats` (§11.3), `deferred_work` (§11.3 queues), `session_muscle_volume` (§14.3/§5.2
  ledger). `sessions.pending_slot` + a partial unique index is the DB-level backstop for §10.10.
- [x] **Migrations**: `0001_init.sql` + `0002_muscle_volume.sql` (added after 0001 specifically to
  prove the mechanism evolves the schema, not just runs once), driver-agnostic runner
  (`migrate.ts`), tracked in `_migrations`.
- [x] **Test harness** (`testHarness.ts`): in-memory `better-sqlite3`, migrated fresh per call —
  every store test uses this, no simulator anywhere.
- [x] **`dates.ts`**: `localDateForInstant` (Intl/`en-CA`-based, derives `local_date` from a real
  `utc_instant` + `tz_id`), `isWithinRollingWindow`, re-exports the engine's `daysBetween`/
  `addDays`. Tests (`dates.test.ts`) pin that flying both east and west compute the correct
  `local_date` from the actual `tz_id`, never a UTC slice — a day is never lost or duplicated.
- [x] **Repositories** (`src/repositories/`): `users` (profile + limitations + tz-change
  observation), `exerciseState` (§4.4, EMA formulas for §8.1 feedback — documented `EMA_ALPHA =
  0.3` decision, best-set comparison, pinned notes with §8.3 create/edit signal logging,
  suppression), `progressionState` (§6.5 cold-start seeding via the engine's own
  `calibrationStartLevel`/`defaultMicroForExercise`), `sessions` (full lifecycle, approval-stage
  edits — removal, set-count adjustment — preserved via `entry_status` rather than deletion,
  mid-workout swap preserving `planned_exercise_id`, crash-safe per-set `logSet`, history
  projection for the engine), `signals` (§8.3 catch-all log + `consecutiveRegenerateTapCount`),
  `milestones`, `stats` (incremental rollups: lifetime count, rolling-7d window, ISO-week streak
  — decision documented inline for the unstated "week" definition — travel-day denominator,
  estimate-accuracy EMA, plus `session_muscle_volume`-backed §14.3/§5.2 muscle queries), `queues`
  (deferred work, enqueue-only — workers are Wave 6).
- [x] **`generation.ts`**: builds the engine's `UserState` from storage (calling
  `ensureProgressionStatesInitialized` for cold start) and implements the §9.9 Recovery Week
  wiring plan below. Also records device `tz_id` on every generation call (§8.3/§9.3).
- [x] **`completion.ts`**: the one completion transaction (`db.transaction`) — per-set performance
  summarized into §6.3 `SessionPerformance`, `applySessionResult` called once per laddered family
  present in the session, exercise-state best-set/EMA/skip updates, `session_muscle_volume`
  ledger rows written, rolled-up stats updated, milestone rows (`level_up`, `best_set_pr`,
  `nth_session`, `recovery_week`), deferred work enqueued (never awaited — §11.1), session flipped
  to `completed`. Throws cleanly if the session is missing or already completed/discarded.
- [x] **Tests** (34 total in `packages/store`, all green): `testHarness.test.ts` (migration
  round-trip + idempotency), `dates.test.ts` (flying east/west, rolling window), `lifecycle.test.ts`
  (single-pending enforcement + DB backstop, discard frees the slot, planned sessions invisible to
  history, force-quit/resume via `set_logs` reconstruction, swap preserves
  `planned_exercise_id`, approval removal preserves the row), `simulation.test.ts` (**the headline
  five-session run**: progression/exercise-state/stats/history all mutate correctly with zero
  network calls, plus a miss-driven regression counterpart), `signals.test.ts` (rest/+15s/pause/
  time-under-set, regenerate taps, sets added/deleted at approval, demo-media expansion, pinned
  note create vs edit, abandonment point, device tz-change signal, travel-day denominator),
  `completion.test.ts` (best-set PR only fires on a genuine improvement not a first-ever set,
  nth-session + llm_distillation always enqueued, healthkit/passport only when opted in, Recovery
  Week logs its milestone and reuses the exact comeback code path).

### §9.9 Recovery Week wiring — implemented as planned, now landed
`pipeline.ts`'s own comeback assessment is entirely internal (derives gap-tier from
`userState.history`) and has no flag to force a tier. `generation.ts`'s `generate()`:
1. Calls the engine's own `applyComebackToProgressionStates(states, families, library, 'week')` —
   the exact §9.4 function, not a reimplementation — and passes the *already-regressed* states in
   as `userState.progressionStates`. Since a Recovery Week's real gap is normally small, the
   pipeline's internal `assessComeback` resolves `tier: 'none'` and passes the caller's states
   through unchanged, so the pre-transform survives untouched with no double-application.
2. The ~20% volume cut (`COMEBACK_VOLUME_MULTIPLIER`) is unreachable via the internal path (gated
   on the pipeline's own history-driven assessment), so it's applied as a documented ~10-line
   post-generation pass (`scaleSessionSets`) multiplying every entry's `sets` and flooring at 1 —
   flagged in code and here as the one deliberate, minimal exception to "don't reimplement engine
   logic in the store," per CLAUDE.md's rule that a deviation needs to be recorded, not silent.
3. `generate()` also independently calls `assessComeback` (read-only, same history the engine
   already used) purely so the session record can carry an accurate `comebackTier` even for an
   auto-detected gap the engine handled invisibly to the caller.
4. `completion.ts` writes a `milestones` row of `type: 'recovery_week'` whenever
   `session.recoveryWeekManual` is true (gates specifically on an *explicit* Recovery Week
   trigger, not every auto-detected 7-day-gap comeback, per §9.9's "logged as a milestone" being
   Recovery-Week-specific product framing distinct from the general §9.4 comeback).

### Known gaps / not done (explicitly out of scope for this track, or deferred)
- **Recovery Week auto-suggest trigger** ("every 6-8 weeks of consistent training") is not
  implemented — `rolled_up_stats.weeks_since_last_recovery_week` exists as a column but nothing
  increments or reads it yet. The *mechanism* (§9.9 calling through §9.4's exact code path) is
  fully wired and tested; only the "when to suggest it" heuristic is missing. This is a dashboard/
  UI-adjacent decision (Wave 5 territory — "Progression board, ... Recovery Week (§9.9)" is
  explicitly in the Wave 5 milestone list) more than a persistence one. Flagging here rather than
  guessing a heuristic silently.
- **Time-of-day / day-of-week** (§8.3) has no dedicated stored column — it's cheaply derivable
  from `sessions.utc_instant` + `tz_id` at read time (`localDateForInstant`'s sibling would give
  local wall-clock time too). Not stored redundantly; noted in case a future wave's query
  ergonomics want a generated column.
- **`app/src/db/` production wiring** (opening the real on-device file with op-sqlite, wrapping it
  with `drizzle-orm/op-sqlite`, passing the handle to this package) is explicitly Wave 4's job per
  ADR 0003 — this track only had to prove the schema/logic is correct in node, not wire the
  simulator.
- **Firestore sync** is explicitly out of scope (Wave 6) — `updated_at` is monotonic and sessions
  are append-only, so nothing here forecloses last-write-wins sync, but no sync code exists.
- `updateUser` now calls `ensureUser` first (fixed during testing — it previously no-op'd silently
  against a nonexistent row, which `app/src/db/`'s real boot sequence would always avoid by
  calling `ensureUser`/`buildUserState` first, but the repo function itself should be robust on
  its own).

### Next (for whichever wave/track needs this)
- Wave 4 (core workout loop UI): wire `app/src/db/` (op-sqlite + `drizzle-orm/op-sqlite`), then
  build the UI directly against `@roamfit/store`'s repository functions — no persistence logic
  should be written in `app/`, only calls into this package.
- Wave 5 (motivation surfaces): the Recovery Week auto-suggest heuristic; wiring the dashboard to
  `statsRepo`'s rolled-up read functions instead of any ad-hoc query.
- If a reviewer prefers the Recovery Week volume-cut multiplier live inside the engine as a real
  `GenerationRequest` field instead of `generation.ts`'s post-pass, that's a small, low-risk,
  clearly-scoped engine change — intentionally not made here per the brief's "don't touch the
  engine beyond explicit wiring" instruction.

### §8.3 signal → storage path checklist — all proven by a test
- [x] reps/seconds vs prescribed per set — `set_logs.reps_actual/seconds_actual` vs
  `session_entries.rep_target/duration_sec` (`simulation.test.ts`)
- [x] set status completed/skipped/not_reached — `set_logs.status` (`simulation.test.ts`,
  `lifecycle.test.ts`)
- [x] time-under-set — `set_logs.started_at/completed_at` (`signals.test.ts`)
- [x] best-set improvement — `exercise_state.best_set_*`, `milestones` type `best_set_pr`
  (`completion.test.ts` — proves a first-ever set does NOT falsely count as an improvement)
- [x] rest taken vs prescribed + `+15s` tap count — `set_logs.rest_taken_sec`,
  `rest_extended_count` (`signals.test.ts`)
- [x] pause count/duration — `set_logs.pause_count`/`paused_duration_sec` (`signals.test.ts`)
- [x] session duration vs estimate — `sessions.actual_minutes` vs `estimated_minutes`
  (`stats.ts`'s `estimateAccuracyEma`, exercised in `simulation.test.ts`)
- [x] exercises removed at approval — `session_entries.entry_status = 'removed_at_approval'`,
  `exercise_state.remove_at_approval_count` (`lifecycle.test.ts`)
- [x] mid-workout swaps (what→what, at which set) — `signal_events` type `swap`,
  `exercise_state.swap_away_count` (`lifecycle.test.ts`)
- [x] sets added/deleted at approval — `session_entries.sets` + `signal_events` types
  `set_added_at_approval`/`set_deleted_at_approval` (`signals.test.ts`)
- [x] regenerate taps + consecutive count — `sessions.regenerate_tap_count`, `signal_events` type
  `regenerate`, `consecutiveRegenerateTapCount` (`signals.test.ts`)
- [x] demo-media expansions — `session_entries.demo_media_expanded`, `signal_events` type
  `demo_media_expanded` (`signals.test.ts`)
- [x] pinned-note create/edit — `exercise_state.pinned_note` + `signal_events` types
  `pinned_note_created`/`pinned_note_edited`, distinct (`signals.test.ts`)
- [x] abandonment point (exercise+set) — `sessions.abandoned_entry_id`/`abandoned_set_index`,
  `signal_events` type `abandoned` (`signals.test.ts`)
- [x] time of day / day of week — derivable from `sessions.utc_instant` + `tz_id` (no dedicated
  column; see "Known gaps" above)
- [x] days since last session — `rolled_up_stats.last_session_local_date` (`simulation.test.ts`
  asserts it's set correctly after 5 sessions)
- [x] device timezone change → travel detection — `signal_events` type `tz_change`, only logged on
  an actual change not the first-ever observation (`signals.test.ts`)
