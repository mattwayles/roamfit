## Track: 27 — Workout history, Logbook past months, progress graphs
Last updated: 2026-10-04
Plan: `~/.claude/plans/let-s-plan-a-joint-rippling-rabin.md` (read-only over local SQLite; no schema change, no migration).
### Done
- [x] Increment 3: day sheet does both (7312880): `CalendarDay.sessionIds`, session cards -> SessionHistory, "Mark this day as…", by-hand line, "tap for details". HomeScreen week strip does not share the handler (it only navigates to Journey), left alone.
- [x] Increment 4: Logbook past months (see `git log`): `shiftMonth/monthLabel/monthShortName/earliestMonth/monthOfLocalDate` in lib/dashboard.ts, `monthCounts`+`earliestMonth` on DashboardData, `lib/useLogbookMonth.ts`, ‹ label › header + month picker Sheet; tests `JourneyScreen.pastMonths.test.tsx`, dashboard.test.ts.
- [x] Pre-flight: this file (cc79c80).
- [x] Increment 1: store reads + tests (9f54b7e). `DashboardSessionSummary.id`, `getCompletedSessionsInRange`,
  `countCompletedSessionsByMonth`, `getCompletedSessionDetail`, `getFamilyPerformanceHistory`.
- [x] Increment 2: workout history page (see `git log`): `SessionHistory` route, `lib/sessionHistory.ts`,
  `screens/SessionHistoryScreen.tsx`; tests `sessionHistory.test.ts`, `SessionHistoryScreen.test.tsx` (incl. Daylight).
  The "Trail ›" link is NOT built (no `TrailProgress` route yet) — Increment 6 adds it; rows already carry `familyId`.
### In progress
- Nothing (Increments 1-4 landed). Next agent starts Increment 5.
### Next
5. Increment 5 — `ProgressChart` + `chartGeometry.ts`; Exercise detail full-history line chart (load `dataviz` skill first).
6. Increment 6 — Trail progress page (`TrailProgress` route, `lib/trailProgress.ts`, screen, "Progress ›" on Trail cards); also add the "Trail ›" link on the history page's exercise rows.
7. Increment 7 — Docs: BACKLOG device-pass-owed item; park deliberately-omitted ideas (focus filter / "last leg day" search, weekly-volume charts).
### Decisions / gotchas
- Day tap opens a day sheet that does both: the day's workout card(s) on top (tap opens its history page), "Mark this day as…" below. A day with no session looks like today's sheet.
- Past months: ‹ › arrows on the Logbook header plus a month picker (tap the month label) showing a year/month grid with workout counts.
- Graphs live on Trail pages and Exercise detail; a new movement-group page opens from each Trail card; Exercise detail's bars become a full-history line chart; the history page links to both.
- Never punish: skipped sets neutral, headlines compare best to first, no red dips. Level ids, not indexes. `local_date` only.
- `SessionHistory` is a root-stack route taking `{ sessionId }`. Navigate with `navigation.navigate('SessionHistory', { sessionId })`; it shows a quiet "not in your history" state for non-completed sessions.
- `DashboardSessionSummary.id` is now on every dashboard summary; `getCompletedSessionsInRange(db, from, to)` is uncapped, newest first, inclusive; `countCompletedSessionsByMonth` returns `Map<'YYYY-MM', number>` (empty months absent).
- `actualMinutes` is stored fractional; display code must round (history page does: `Math.max(1, Math.round(...))`).
- Plan says `SectionTitle`; the real primitive is `SectionHeader`.
- No new dependencies.
- Logbook viewedMonth resets to the current month on tab focus, except coming back from a workout opened off the day sheet (ref flag `keepMonthOnFocus`), so paging isn't lost on return.
- Header shows the year only outside the current year; picker lists years from the earliest mark to now; months before the earliest in the first year are selectable zero-count pills.
