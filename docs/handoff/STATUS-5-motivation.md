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
(nothing committed yet this session — see plan above)

### In progress
Starting step 1 (engine `sessionsUntilNextLevel`).

### Next
See Plan above, in order.

### Decisions / gotchas
- One screen (`HomeScreen.tsx`) carries the whole §14.1 dashboard — see "Key findings" above.
- §9.10 share cards ship as native text share, not a rendered image — see "Key findings" above.
