## Track: 5-motivation — Motivation surfaces
Last updated: 2026-08-31

### Read before starting
CLAUDE.md, wave-05-motivation.md, ORCHESTRATION.md (status board + carried-forward #4/#5/#11/#12
+ verification log), STATUS-4-loop.md, STATUS-4b-loop-completion.md, `packages/store/src/index.ts`
+ `repositories/{stats,milestones,progressionState,users,queues}.ts`, `packages/engine/src/index.ts`,
spec §14, §6.4, §6.7, §9.1-9.4, §9.6-9.10, §10.1.

### Key findings from ramp-up (context for future increments)
- Wave 3 already built almost the entire persistence substrate this wave needs: `sessions.city`/
  `country` columns, `milestones` table with `level_up`/`best_set_pr`/`recovery_week`/`nth_session`/
  `new_city` types, `rolledUpStats.weeksSinceLastRecoveryWeek` column, `deferredWork` with a
  `passport_geocode` kind, `comebackTier`/`recoveryWeekManual` on sessions, `generate()`'s
  `recoveryWeek` param already wired end-to-end through `applyComebackToProgressionStates('week', …)`.
  This wave is mostly UI + a few real gaps, not new schema.
- **Confirmed real gap (issue #12):** `weeksSinceLastRecoveryWeek` is declared in the schema and
  read by `RolledUpStatsRecord`, but **nothing ever increments or resets it** — grepped the whole
  repo, zero writes. The auto-suggest trigger is genuinely unbuilt, not just unwired.
- **HomeScreen.tsx's existing "This week" dots row is a bug**, not a placeholder: it renders
  `'●'.repeat(min(lifetimeSessionCount, 7))`, i.e. lifetime count forever capped at 7 filled dots,
  never the rolling-7-day count against `weeklyTarget`. `statsRepo.rollingSessionCount` and
  `effectiveWeeklyDenominator` (travel-day-aware) already exist and are unused. Fixing this is
  in scope here (§9.1/§14.1.2).
- §10.1 lists the Home screen's scroll order as Today card → Quick Session → This week → Next
  Unlock → (scrolling) progression board → passport → calendar → muscle balance — and §14.1
  gives the identical order for "the dashboard." Decision: **one screen** (`HomeScreen.tsx`),
  not a separate Dashboard screen + a thin Home — matches the spec's own ordering exactly and
  is what makes the zero-session state trivially "the first thing every new user sees."
- Level-up celebration already exists in skeletal form in `SummaryScreen.tsx` (Wave 4) — full-
  screen-ish, fires before the Done button. This wave upgrades it (named variant preview, mastery
  PR treatment, share action) rather than building from scratch.
- No share/image-rendering library is installed (`react-native-view-shot`, `react-native-share`,
  etc. — checked `app/package.json`). Building a true rendered image card per §9.10 would need a
  new dependency. Decision, recorded per CLAUDE.md "no new deps without noting them": ship §9.10
  with RN's built-in `Share.share()` (text-based share sheet, real native share action, no new
  dependency) rather than add an image-rendering lib this late in the wave's budget. This is a
  scope cut, not a fake — the share sheet is real, the artifact is text instead of a rendered PNG.
  Flagged honestly below; a future wave can add `react-native-view-shot` if product wants the
  literal branded image.

### Plan (small commits, this order)
1. Engine: `sessionsUntilNextLevel` pure simulation (micro-steps remaining until a level change),
   exported, tested. Substrate for Next Unlock's "N sessions from X."
2. Store: implement the recovery-week auto-suggest counter (issue #12) + `shouldSuggestRecoveryWeek`.
   ADR for issue #11 (keep the volume cut as a store-level pass; record why explicitly).
3. Confirm issues #4/#5 harmless (read-only check, no code expected).
4. HomeScreen: fix weekly dots, add Next Unlock + Progression board (zero-session safe) — priority 1/2.
5. HomeScreen: travel day button, comeback banner, recovery-week suggestion banner — priority 3.
6. HomeScreen: passport section (opt-in) — priority 4.
7. HomeScreen: calendar heatmap, muscle balance bars, lifetime counters, estimate accuracy.
8. SummaryScreen: level-up/mastery celebration upgrade + share.
9. Notifications module (best-effort, scoped).
10. Grep-for-shame pass, `npm run check`, ORCHESTRATION.md update.

### Done
- [x] **Step 1** (`e52c432`) — `packages/engine/src/progression/micro.ts`'s `microStepsToNextLevel`:
  pure simulation of repeated `microAdvance` calls until a level change fires, capped at 100 steps
  as a belt-and-braces guard. Exported from `packages/engine/src/index.ts`, along with the ladder
  lookups (`findFamily`, `levelById`, `exerciseForLevel`, `isMaxLevel`, `levelOrdinal`, `nextLevel`)
  the progression board UI needs — none of those were exported before this wave. 3 new tests in
  `micro.test.ts` (walks the real advance sequence and confirms the count decrements by exactly 1
  each step, hits exactly 1 the step before a level change, band vs. bodyweight).
- [x] **Step 2 / issue #12** (`1d30847`) — confirmed via grep that `weeksSinceLastRecoveryWeek` was
  declared in schema but never written anywhere. Implemented incrementally in
  `packages/store/src/repositories/stats.ts`'s `recordSessionCompletion`: a Recovery Week
  completion (`recoveryWeekManual`) resets the counter to 0; any other completed session bumps it
  by 1 the first time a *new* ISO week (via the file's existing `isoWeekKey`) produces a session —
  same-week repeats don't double-count. Added `shouldSuggestRecoveryWeek(stats)` (true for
  6-8 weeks inclusive, per §9.9's literal "every 6-8 weeks"). Threaded `session.recoveryWeekManual`
  through `completion.ts` into the new `RecordSessionCompletionInput` field. 3 new tests in
  `completion.test.ts` covering: same-week de-dup, the false-then-true transition at 5→6 weeks,
  and the reset-on-Recovery-Week-completion behavior (never "penalizes," per §1.1).
- [x] **Issue #11** — ADR 0006 (`docs/decisions/0006-recovery-week-volume-cut-placement.md`):
  decided to *keep* the ~20% volume cut as `generation.ts`'s store-level post-generation pass
  rather than promote it into the engine this wave. Full reasoning in the ADR; short version: the
  store-level pass already applies the engine's own exported `COMEBACK_VOLUME_MULTIPLIER` verbatim
  (not a re-derived number), so the invariant-2 risk is narrow, and the "who decides a Recovery
  Week is happening" question would stay a store/UI concern either way. Documents a real, narrow
  known gap (post-hoc `Math.floor` can't rebalance across a pattern-gap substitution the way
  in-prescription cutting could) rather than hiding it.
- [x] **Issues #4/#5 confirmed, no code needed:**
  - #4 (`hamstring-curl`/`tke` tagged `hip_extension`): confirmed the pattern enum *has* since
    grown a `knee_flexion_loaded` bucket (`packages/data/src/schema.ts`/`validate.ts`), but the two
    exercises' content rows were never migrated to it. Confirmed harmless to engine correctness:
    their `primary`/`secondary` muscle tags (`hamstrings`/`quads`) are correct regardless of
    pattern label, so §14.3 muscle-balance credit is accurate; the pattern tag only affects
    which template slot they can fill, and filling the legs template's `hip_extension` accessory
    slot with a knee-dominant isolation movement isn't a functional bug, just an imprecise label.
    **Left open as a future content pass** (retag to `knee_flexion_loaded` now that the bucket
    exists), not a Wave 5 blocker — recorded here rather than silently dropped.
  - #5 (conditioning finishers forced to `tier: fill`): already resolved by Wave 2 —
    `packages/engine/src/template/focusTemplate.ts`'s `TemplateSlot.isFinisher` flag exists
    specifically to let a finisher slot draw from `tier: fill` regardless of pattern match quality,
    with an inline comment citing this exact carried-forward issue. Confirmed handled, not just
    present by accident.

- [x] **Step 4/5** (`5217072`, `b55490c`) — `app/src/lib/dashboard.ts` (new, pure, tested —
  `dashboard.test.ts`, 8 tests including a "zero-session board has every family, none mastered"
  case): `buildProgressionBoard`, `nextUnlockHero` (picks the single most-imminent family, not a
  list — matches §14's "one concrete, close reward"), `overWorkedMuscles`/`buildMuscleBalanceRows`
  (built now, wired into `HomeScreen` in a later step). `HomeScreen.tsx` rewritten to the full
  §10.1/§14.1 order: comeback banner → travel auto-suggest banner → Recovery Week suggest banner →
  Today/Resume card → Quick Session → This week (bug fixed, see below) + travel button → Next
  Unlock hero → Progression board (with the zero-session calibration note and §6.7 Mastery
  badges). `GenerateScreen.tsx` gained the §9.9 manual Recovery Week toggle (route-param-seedable
  from Home's suggestion banner, `generate(..., recoveryWeek)`); `navigation/types.ts`'s `Generate`
  route now carries an optional `recoveryWeek` param.
  - **Fixed the pre-existing "This week" dots bug** found during ramp-up: now
    `statsRepo.rollingSessionCount`/`effectiveWeeklyDenominator` (travel-day-aware), not
    `lifetimeSessionCount` capped at 7.
  - **New test** `HomeScreen.dashboard.test.tsx` — the exact scenario the brief said would be
    independently verified: mounts the real navigator against a **fresh, never-touched** on-device
    db (separate Jest file -> separate db filename, so this is genuinely zero-session, not reset
    state) and asserts the Today card, calibration note, Next Unlock hero, and every family's
    board row are present with zero sessions ever run.
  - **Scope simplification, recorded honestly**: the §9.3 travel-day auto-suggest banner detects
    "a tz_change signal today" but has no persisted per-day dismissal — dismissing it only lasts
    the current screen visit (no new schema column for this was added this wave). Functionally
    correct, just not permanently silence-able within a day without marking travel.
  - `npm run check` green (engine 873, store 37, data 2, app 32 across 13 suites; app suite count
    includes the two new files above).

### In progress
Starting step 6 (passport) + remaining §14.1 elements (calendar heatmap, muscle balance,
lifetime counters, estimate accuracy) — plan says do these together since they all live in the
same `HomeScreen.tsx` scroll and share the same `stats` object already fetched.

### Next
See Plan above (steps 6-10).

### Decisions / gotchas
- One screen (`HomeScreen.tsx`) carries the whole §14.1 dashboard — see "Key findings" above.
- §9.10 share cards ship as native text share, not a rendered image — see "Key findings" above.
