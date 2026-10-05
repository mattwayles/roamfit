## Track: 27 — Workout history, Logbook past months, progress graphs
Last updated: 2026-10-04 (track complete pending device pass)
Plan: `~/.claude/plans/let-s-plan-a-joint-rippling-rabin.md` (read-only over local SQLite; no schema change, no migration).
### Done
- [x] Increment 7: BACKLOG — 'device pass owed' (Desired Fixes) and the two parked ideas (Future Features); this file finalised. See `git log`.
- [x] Increment 6: Trail progress page (see `git log`): `TrailProgress` route, `lib/trailProgress.ts` (segments per exercise, level-id markers labelled via levelOrdinal, rung step series, dominant-unit gaps, best-vs-first headline), `screens/TrailProgressScreen.tsx`, quiet 'Progress ›' beside Adjust on Journey Trail cards (testID `board-trail-progress-<family>`; `board-progress-*` already exists for the progress bar), 'Trail ›' on SessionHistory rows (row is now a View holding the exercise PressableScale + Trail button). Tests: trailProgress.test.ts, TrailProgressScreen.test.tsx (incl. Daylight).
- [x] Increment 5: `components/ProgressChart.tsx` (SVG line chart: time-proportional x, labelled y gridlines, nearest-point tap readout, dashed markers, per-segment colours, step mode, onLayout width), `lib/chartGeometry.ts`; Exercise detail now charts the FULL history with a Best set / Total volume toggle (CHART_WINDOW and the bar Chart removed). Tests: chartGeometry.test.ts, ProgressChart.test.tsx (both themes), ExerciseDetailScreen.test.tsx. See `git log`.
- [x] Increment 3: day sheet does both (7312880): `CalendarDay.sessionIds`, session cards -> SessionHistory, "Mark this day as…", by-hand line, "tap for details". HomeScreen week strip does not share the handler (it only navigates to Journey), left alone.
- [x] Increment 4: Logbook past months (see `git log`): `shiftMonth/monthLabel/monthShortName/earliestMonth/monthOfLocalDate` in lib/dashboard.ts, `monthCounts`+`earliestMonth` on DashboardData, `lib/useLogbookMonth.ts`, ‹ label › header + month picker Sheet; tests `JourneyScreen.pastMonths.test.tsx`, dashboard.test.ts.
- [x] Pre-flight: this file (cc79c80).
- [x] Increment 1: store reads + tests (9f54b7e). `DashboardSessionSummary.id`, `getCompletedSessionsInRange`,
  `countCompletedSessionsByMonth`, `getCompletedSessionDetail`, `getFamilyPerformanceHistory`.
- [x] Increment 2: workout history page (see `git log`): `SessionHistory` route, `lib/sessionHistory.ts`,
  `screens/SessionHistoryScreen.tsx`; tests `sessionHistory.test.ts`, `SessionHistoryScreen.test.tsx` (incl. Daylight).
  The "Trail ›" link was added in Increment 6.
### In progress
- Nothing. Track 27 code is complete; the only thing left is the device pass (BACKLOG, Desired Fixes).
### Next
- Device pass (see BACKLOG 'History / past months / progress graphs — device pass owed').
- Deliberately unbuilt, parked in BACKLOG Future Features: focus filter / 'last leg day' search; weekly-volume charts / Progress hub.

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
- Charts: `ProgressChart` takes points with `segment`/`gapBefore`; segment colours are `SEGMENT_TONES` (pine, sky, gold, lagoon, summit; never rose, which is cardio-only) and cycle after five exercises (the legend names them). The dataviz palette validator was not run on these theme tokens.
- Trail progress charts the dominant unit (reps vs seconds); other-unit sessions are omitted and the line breaks. Rung series still includes them.
- `board-progress-<family>` was already taken (Journey progress bar); the Trail page button is `board-trail-progress-<family>`.
