## Track: 27 — Workout history, Logbook past months, progress graphs
Last updated: 2026-10-04
Plan: `~/.claude/plans/let-s-plan-a-joint-rippling-rabin.md` (read-only over local SQLite; no schema change, no migration).
### Done
- [x] Pre-flight: this file.
### In progress
- Increment 1: store reads. `packages/store/src/repositories/sessions.ts` (`id` on DashboardSessionSummary,
  `getCompletedSessionsInRange`, `countCompletedSessionsByMonth`, `getCompletedSessionDetail`) and
  `exerciseCatalog.ts` (`getFamilyPerformanceHistory`, shared set-folding). Tests alongside.
### Next
1. Increment 1 — store reads (in progress).
2. Increment 2 — workout history page: `SessionHistory` route, `lib/sessionHistory.ts`, `SessionHistoryScreen.tsx`.
3. Increment 3 — Journey day sheet does both (session cards + "Mark this day as…"); `CalendarDay.sessionIds`.
4. Increment 4 — Logbook past months: `viewedMonth`, ‹ › arrows, month picker, `useLogbookMonth`.
5. Increment 5 — `ProgressChart` + `chartGeometry.ts`; Exercise detail full-history line chart (load `dataviz` skill first).
6. Increment 6 — Trail progress page (`TrailProgress` route, `lib/trailProgress.ts`, screen, "Progress ›" on Trail cards); also add the "Trail ›" link on the history page's exercise rows.
7. Increment 7 — Docs: BACKLOG device-pass-owed item; park deliberately-omitted ideas (focus filter / "last leg day" search, weekly-volume charts).
### Decisions / gotchas
- Day tap opens a day sheet that does both: the day's workout card(s) on top (tap opens its history page), "Mark this day as…" below. A day with no session looks like today's sheet.
- Past months: ‹ › arrows on the Logbook header plus a month picker (tap the month label) showing a year/month grid with workout counts.
- Graphs live on Trail pages and Exercise detail; a new movement-group page opens from each Trail card; Exercise detail's bars become a full-history line chart; the history page links to both.
- Never punish: skipped sets neutral, headlines compare best to first, no red dips. Level ids, not indexes. `local_date` only.
