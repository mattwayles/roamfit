## Track: 40 — Trim first-launch setup; remove training days per week
Last updated: 2026-10-18

User request (verbatim intent):
- Remove "Where are you starting from?" (placement) from setup; every user starts at the bottom rung.
- Remove "What do you have to train with?" (equipment) from setup; Generate already asks per workout.
- Remove "Your bands" from setup, keep it in Settings. On Generate, ticking Resistance bands with no
  bands set up warns and offers to set them up before continuing.
- Remove training days per week from the app completely.
- Remove "Anchoring bands safely" from setup; keep it in Settings (Learn).

### Done
- [x] Step 1: setup is welcome, goal, limitations (review: goal, limitations) — e7bdde1
- [x] Step 2: users.bands_set_up (0035) + Generate "Set up your bands first?" sheet; Your bands edits
  set the flag — (next commit)

### In progress
- Step 3: remove days per week (see Next for the full list).

### Next
3. Remove days per week: DaysPerWeekStepper, TrainingPreferences stepper, Settings summary,
   week-streak motivation lines + weekStreak, store weeklyTarget (stats, completion, instrumentation,
   users repo), engine UserProfile.weeklyTarget + test fixtures, migration dropping
   users.weekly_target and rolled_up_stats.week_streak.

### Decisions / gotchas
- Another session (wanderlift-12) had uncommitted no-band-ladder work in packages/data, engine
  pipeline.test.ts / properties.test.ts / golden snapshot, and docs/BACKLOG.md when this track
  started. It landed as 6ca3b13 before step 2, so the tree was clean from then on. Still commit by
  explicit path in case another session is active.
- Settings → Starting levels (PlacementScreen) is kept: the request was about setup only.
- Week streaks also contradict invariant 4 (no streaks), so removing them is doubly right.
