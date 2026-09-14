## Track: 16 — Daily motivation notification pool
Last updated: 2026-09-14

### Read before starting
CLAUDE.md, `docs/handoff/STATUS-5-motivation.md` (the notification feature this replaces),
`app/src/lib/motivationNotifications.ts`, `app/src/lib/motivationMessages.ts`,
`app/src/screens/SettingsScreen.tsx`, `packages/store/src/repositories/users.ts`'s
`NotificationPrefs`.

### Request (verbatim, condensed)
User drags their feet on training. Wants a daily motivational push, picked from a large pool so
it doesn't get stale (feel-good reminders, "just do a quick session," "wrap up your work day with
a workout," a streak reminder, a near-level-up reminder, etc.). Skip the day entirely if a workout
is already done today or the day is marked "in transit." On/off in Settings. User picks how many
notifications/day and the exact time of each. Must still respect the existing quiet-hours setting.

### Key findings from ramp-up
- A daily motivational notification system **already existed** (Wave 5, `b5dabf2`,
  `STATUS-5-motivation.md`): seven fixed weekday `expo-notifications` calendar triggers, one
  adaptive "next unlock" nudge auto-timed to the user's observed training hour, a Sunday-only
  weekly summary, and a boolean quiet-hours toggle with **no** count/time controls and **no**
  per-day skip. None of that matched the new ask (user-chosen count + exact times, explicit skip
  conditions), so this track **replaces** that scheduling design rather than layering onto it —
  recorded here plainly per CLAUDE.md's "don't silently re-scope."
- `sessionLocalHours`/`observedTrainingHour` (the old auto-hour-detection pair) were removed as
  dead code once times became explicitly user-chosen — nothing else referenced them.
- The weekly-summary/streak copy isn't gone, it's folded into the pool as gated templates
  (`streak-1`/`streak-2` in `motivationMessages.ts`, keyed on `stats.weekStreak > 0`) since there's
  no more "always Sunday" slot once every day gets the same user-chosen times.
- **Local notifications can't run app code at delivery time** — this is the one real constraint
  the whole design turns on. "Skip if already trained/traveling today" can only be evaluated when
  the schedule is *(re)built*, not when a notification fires. Solved the same way this app already
  solves "opportunistic, not truly background" problems (see `runOpportunisticSync`): reschedule a
  rolling **7-day** window of one-shot (`DATE` trigger) notifications every time `HomeScreen`'s
  `load()` runs — which includes right after marking a travel day or finishing a session, since
  both routes land back on Home. Recorded as an honest limitation in `docs/BACKLOG.md` (mirrors
  the existing "sync trigger is weak" entry) rather than claimed as fully robust.
- `manualDayMarkersRepo`'s `DayMarker` is a *retroactive calendar correction*, not "in transit"
  itself — the actual travel-day source of truth for "today" is `signalsRepo`'s `travel_day`
  signal events (what the "I'm in Transit" button on Home logs via `statsRepo.recordTravelDay`),
  already loaded into `HomeScreen.tsx`'s `travelLocalDates` set for the calendar heatmap. Reused
  that set (`travelLocalDates.has(clock.today)`) rather than adding new persistence.
- "Already completed today" reads straight off `stats.lastSessionLocalDate === clock.today` — no
  new query needed, that field already existed on `RolledUpStatsRecord`.
- No time-picker component/dependency exists anywhere in the app (confirmed via research
  subagent). Built a plain +/-15-minute stepper (`shiftTime` in `motivationNotifications.ts`) on
  `Pressable`/`Text` instead of adding a native date-picker dependency — no new dependency, no
  Expo dev-client rebuild needed.

### Done
- [x] `packages/store/src/repositories/users.ts` — `NotificationPrefs` gained
  `motivationEnabled?: boolean` and `motivationTimes?: string[]` ("HH:MM" 24h, one entry per
  daily notification; count is just the array length, no separate field).
  `DEFAULT_NOTIFICATION_PREFS` updated to match (`motivationEnabled: true`,
  `motivationTimes: ['18:00']`) — matches the pre-existing "not auto-applied on read" convention
  (callers already do `?? true`/`?? [...]`, same as `quietHoursEnabled`). New test in
  `users.test.ts` confirming a `motivationTimes` patch doesn't clobber `quietHoursEnabled` and
  vice versa (same shallow-merge property the existing test already covered for one field).
- [x] `app/src/lib/motivationMessages.ts` (new, pure) — the message pool. ~13 templates: 9 always-
  applicable (feel-good / quick-session / end-of-workday / consistency framing), 2 gated on
  `hero !== null` (near-level-up, one of them additionally gated `sessionsRemaining <= 2`), 2
  gated on `weekStreak > 0`/`>= 2`. `buildMotivationPool(ctx)` filters to what applies today;
  `pickDailyMessages(pool, count, rng)` deterministically shuffles (local Fisher-Yates, no new
  engine export needed) and returns `count` messages, cycling only if `count` exceeds pool size.
  Tests in `motivationMessages.test.ts` cover pool gating, no-guilt-copy grep, determinism for a
  fixed seed, and the cycling-not-throwing edge case.
- [x] `app/src/lib/motivationNotifications.ts` — rewritten. `clampToQuietHours` now takes/returns
  a `"HH:MM"` string (was hour-only). New `shiftTime` (Settings stepper). New
  `scheduleMotivationNotifications`: cancels the full possible identifier space
  (`motivation-slot-<dayOffset>-<slot>`, `dayOffset` 0-6, `slot` 0-`MAX_DAILY_MOTIVATION_TIMES-1`)
  every call so a lowered count never leaves orphans, returns early if disabled or no times are
  set, otherwise for each of the next 7 days (skipping day 0 entirely when `skipToday`) picks that
  day's messages with a date-seeded rng and schedules one `DATE`-trigger notification per
  user-chosen time (clamped through quiet hours, skipped if already in the past for today).
  `MAX_DAILY_MOTIVATION_TIMES = 5` caps both the per-day count and the identifier space.
  Old `sessionLocalHours`/`observedTrainingHour`/`buildDailyNudgeText`/`buildWeeklySummaryText`
  removed (superseded, see "Key findings"). Test file rewritten to match
  (`motivationNotifications.test.ts`): `clampToQuietHours` and `shiftTime` on the new string shape.
- [x] `app/src/screens/HomeScreen.tsx` — `load()`'s reschedule block now passes
  `motivationEnabled`/`motivationTimes` from `user.notificationPrefs`, a `motivationContext` built
  from `nextUnlockHero(board)` + `stats.weekStreak`, and `skipToday` from
  `stats.lastSessionLocalDate === clock.today || travelLocalDates.has(clock.today)` (both already
  computed earlier in the same function — no new queries). No change needed to the travel button
  or session-completion flow: both already route back through `useFocusEffect(load)` on Home.
- [x] `app/src/screens/SettingsScreen.tsx` — new "Daily motivation" toggle
  (`toggle-motivation`) plus a `motivation-times` list (only rendered when enabled): each row has
  a `-`/`+` 15-minute stepper (`motivation-time-<i>-minus`/`-plus`/`-value`) and a "Remove" (kept
  to a minimum of one time — the master toggle is what "none" means), plus "+ Add a time" capped
  at `MAX_DAILY_MOTIVATION_TIMES`. All writes go through the existing `usersRepo.updateUser`
  shallow-merge patch pattern, no new store function.
- [x] `docs/BACKLOG.md` — two new Future Features entries: on-device verification still owed
  (same Jest-only caveat every notification feature in this app carries), and the 7-day
  schedule-window honest limitation (mirrors the existing "sync trigger is weak" entry).
- [x] `npm run check` green throughout (app 72 suites/432 tests, engine 26/1195, data 1/12,
  store 25/174, functions 9/34).

### Next (for whoever picks this up)
1. `expo run:ios` pass: actually see a scheduled notification land at a chosen time, confirm it's
   suppressed after marking today's workout done or hitting "I'm in Transit," confirm quiet hours
   really shift it, confirm the Settings stepper/add/remove UI behaves on a real device.
2. If 7-day staleness (see BACKLOG) proves annoying in practice: revisit with
   `expo-background-task` (new native dependency, dev-client rebuild) to refresh the window
   without requiring the app to be opened.
3. No `HomeScreen`/`SettingsScreen` RNTL test was added for the new wiring itself (existing
   `HomeScreen.*.test.tsx` files weren't touched — they don't assert on notification scheduling
   shape, only on data/render, so nothing broke) or for the new Settings rows. Wave 5's Home tests
   already didn't cover the old notification call either, so this isn't a new gap, but a future
   pass could add one exercising the toggle/stepper/add/remove interactions with RNTL.

### Decisions / gotchas
- Old fixed weekday-scheduling design fully replaced, not layered — see "Key findings."
- "In transit today" = `signalsRepo` `travel_day` events for `clock.today`, not
  `manualDayMarkersRepo` (that one's a retroactive calendar-display correction, a different thing
  that happens to share the word "travel").
- No new native dependency: time selection is a plain-JS stepper, not a native wheel/date picker.
