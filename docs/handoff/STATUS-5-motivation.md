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

- [x] **Steps 6/7** (`2877bcc`) — every remaining §14.1 element:
  - New migration `0003_lifetime_total_minutes.sql` (`rolled_up_stats.lifetime_total_minutes`,
    REAL, incremented in `recordSessionCompletion` — the one true rolled-up-stats gap for §14.1.8;
    everything else that section needs was already derivable). Followed ADR 0005's process (edit
    `.sql` + `migrations/data.ts`'s embedded copy in the same commit; `migrate.test.ts`'s
    byte-for-byte check passed).
  - New `sessionsRepo.getCompletedSessionsForDashboard` — a light projection (localDate,
    actualMinutes, estimatedMinutes, city, country) for the calendar/passport, deliberately not
    reusing `getHistoryForGeneration`'s full entry/set-log tree (that one is shaped for the engine,
    this one for two read-only UI lists).
  - `dashboard.ts` gained `buildPassportSummary`, `buildCalendarDays`, `buildLifetimeCounters` —
    13 new pure tests (`dashboard.test.ts`) covering dedup, the untrained-day-is-present-not-omitted
    rule, and the actualMinutes-null fallback.
  - `HomeScreen.tsx`: Passport (opt-in nudge when off, full card with city/country counts once
    `passportEnabled && cities.length > 0`), calendar heatmap (28-day trailing window, untrained
    days rendered as a neutral gray cell — never omitted, never red), muscle balance (horizontal
    bars, OVER-WORKED shown as plain trailing text in the same row style as every other row, not a
    color change), lifetime counters grid, and the estimate-accuracy trust line. All of these are
    gated on `lifetimeSessionCount > 0` (progressive disclosure, per §14.2's "passport and
    calendar appear once they have anything to show" — extended the same principle to the other
    session-derived sections since a "0 sessions / 0 minutes" grid adds no value at cold start,
    where the brief's actual requirement — board, hero, Today card, calibration note — is what
    must show).
  - **New test** `HomeScreen.afterSession.test.tsx` — the just-completed-a-session state the
    brief's testing note explicitly asked for (not just zero-session and "the happy middle"):
    drives a real generate -> start -> logSet -> completeSession sequence through the store, then
    renders Home and asserts lifetime counters/muscle balance/calendar heatmap now render and the
    zero-session calibration note is gone.
  - `npm run check` green (engine 873, store 38, data 2, app 38 across 14 suites).

- [x] **Step 8** (`b490fc0`) — `app/src/lib/celebration.ts` (new, pure, 5 tests): shapes
  `completeSession`'s `progressionEvents` + the milestone rows it wrote into "full-screen,
  unmissable" celebrations (level-ups, and Mastery best-set PRs matched via `mastery_pr_check`
  progression events cross-referenced with `best_set_pr` milestone payloads) vs. "quiet,
  accumulating" ones (ordinary PRs, nth-session, new-city, recovery-week). `SummaryScreen.tsx`
  rewritten: FINISH now shows full-screen celebrations **one at a time, before** the plain
  completion summary (previously both were stacked in one scroll view) with a real §9.10
  `Share.share` action on each. New `SummaryScreen.test.tsx` drives a real calibration-mode
  session (rep bonus large enough to trigger §6.5's "exceeds target by >=25%" full-level advance)
  through FINISH and asserts the celebration really appears before Done, share really fires, and
  Continue reaches the Done screen — not a mocked/fabricated progression event.
- [x] **Step 9** (`b5dabf2`) — §9.8 notifications: new `sessionsRepo.getCompletedSessionStartTimes`
  (startedAt + that session's own `tzId`, so "observed training window" reflects where the user
  actually was, not the device's current tz) and `app/src/lib/motivationNotifications.ts` (pure
  core: `sessionLocalHours`/`observedTrainingHour`/`clampToQuietHours`/copy builders, 11 tests).
  **"Max one per day" is structural, not a rule to remember**: seven weekday-scoped
  `expo-notifications` calendar triggers (fixed identifiers `motivation-nudge-0..6`), re-scheduled
  on every Home open — Sunday carries the weekly-summary copy, the other six carry the adaptive
  loss-aversion nudge (built from Next Unlock when available). Gated on
  `user.hasEverCompletedSession` so a fresh install isn't prompted for notification permission
  before it has anything to be adaptive about. §9.10 share wired for the passport and weekly
  summary too (`share-passport`/`share-weekly-summary` buttons on Home, both real `Share.share`
  calls, tested).
  - **What's Jest-only vs. device-verified** (same honest split Wave 4b established for audio/
    haptics): every test here proves "the right calls happen with the right arguments," never
    that a notification actually appears at the scheduled weekday/hour on a real device, or that
    quiet-hours/permission behavior matches iOS's actual notification center. Not verified this
    session — no device/simulator access was exercised for this track.
  - `npm run check` green throughout (engine 873, store 38, data 2, app 55 across 17 suites).

### Grep-for-shame pass (done criterion)
Ran targeted greps across `app/src`, `packages/store/src`, `packages/engine/src` for: a daily-
streak concept, red/warning color codes tied to untrained days or misses, and guilt-shaped copy
("you missed", "you failed", "don't break your streak", "behind", "slacking", etc.). Result:
**clean** — the only hits are this file's own doc comments describing the absence (e.g.
`HomeScreen.tsx`'s header, `motivationNotifications.ts`'s "never guilt-based"). `stats.weekStreak`
is the spec-sanctioned §9.1 **week** streak ("consecutive weeks the target was hit... lumpy lives,
forgiving math") — not the daily streak the brief prohibits, and it's additive-only (never shown
as broken/reset with any negative framing, just absent when 0). Calendar untrained days render as
a neutral gray (`#e2e8f0`, same family as every other neutral UI element); the OVER-WORKED flag on
the muscle-balance rows is plain trailing text in the row's own font/color, not a color change.

### Final status
Every §14.1 element is built, in spec order, in `HomeScreen.tsx`, gated correctly for the
zero-session state. Issues #4, #5, #11, #12 are resolved (see ORCHESTRATION.md's carried-forward
table, updated this session) or explicitly re-filed as a content-only follow-up (#4's retag).
`npm run check` is green at every commit boundary. Not done, honestly:

- **No on-device/simulator verification this session** — everything above is Jest-level evidence
  only (real store, real screens, real RNTL interactions — not mocked business logic — but never a
  real iOS notification center, a real native share sheet, or a real device screenshot). This
  mirrors Wave 4/4b's own honest split between "proven in Jest" and "proven on a phone"; a future
  session with simulator/device access should do an `expo run:ios` pass the way `STATUS-4b-loop-
  completion.md`'s evidence section did, and actually watch a level-up celebration and a share
  sheet render for real.
- **§9.10 share cards are text, not a rendered branded image** — no image-rendering library is
  installed (`react-native-view-shot`, etc.); adding one was judged not worth the wave's remaining
  budget over finishing every §14.1 element. Recorded as a scope cut, not a silent gap. The share
  *action* (native share sheet, real content) is real; only the artifact format differs from the
  spec's literal "branded image card."
  - **New dependency note (CLAUDE.md: no new deps without noting them):** none were added. RN's
    built-in `Share` API covered §9.10 entirely.
- **Travel-day auto-suggest has no persisted per-day dismissal** — dismissing the "Looks like you
  traveled" banner only lasts the current screen visit (component state, not a store column). No
  new schema was added for this in favor of shipping every other element; a future pass could add
  a `lastTravelSuggestionDismissedLocalDate` column if this proves annoying in practice.
- **Notification quiet hours are a fixed 22:00-07:00 default**, not user-configurable — there is no
  settings screen in this wave's (or any prior wave's) scope to put a picker in. Same for the
  silent-switch audio override noted in Wave 4b — both are "real default behavior, no user
  override UI yet."
- **Passport geocoding itself is unbuilt** (by design — it's Wave 6's `deferred_work` worker, not
  this wave's). This wave's passport UI is honest about that: it reads whatever `city`/`country`
  strings already exist on completed sessions (none will, until Wave 6 ships the resolver) and
  shows the opt-in nudge instead of a fake/empty passport card in the meantime.
- **Level-up celebration's "which family leveled up first" ordering** is whatever order
  `completeSession`'s `progressionEvents` array returns them in (a `Map` iteration over
  `byFamily`, itself built from `session.entries`' plan order) — not deliberately re-sorted by
  "most exciting first." Untested whether that reads as arbitrary in a real multi-level-up session
  (rare in practice — most sessions produce at most one).

### Next (for whoever picks this up)
1. An `expo run:ios` pass: build, boot, and screenshot the zero-session dashboard, a completed-
   session dashboard, a level-up celebration, and both share sheets for real — this track's Jest
   coverage is real but, per CLAUDE.md's own "Standing lesson," not sufficient proof by itself.
2. If product wants a literal branded-image share card: add `react-native-view-shot` (or similar),
   capture the relevant card `View`, and pass the resulting URI to `Share.share` instead of a
   plain message string. `celebration.ts`/`motivationNotifications.ts`'s text-building functions
   are already the right content source — this is a rendering layer on top, not a rewrite.
3. Retag `hamstring-curl`/`tke` from `hip_extension` to the now-existing `knee_flexion_loaded`
   pattern (content-only change, `packages/data/library/exercises.json` + a validator re-run).
4. If travel-day-suggestion nagging turns out to matter: a persisted per-day dismissal column.

### Decisions / gotchas
- One screen (`HomeScreen.tsx`) carries the whole §14.1 dashboard — see "Key findings" above.
- §9.10 share cards ship as native text share, not a rendered image — see "Key findings" above.
