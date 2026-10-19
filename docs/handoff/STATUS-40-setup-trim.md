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
- (none yet)

### In progress
- Step 1: OnboardingFlow steps → welcome, goal, limitations (review: goal, limitations). Update
  `app/src/screens/Onboarding.test.tsx`.

### Next
2. Bands set-up flag (users.bands_set_up, migration 0035; existing rows = 1, new = 0; set on any
   Your bands edit) + Generate warning sheet when ticking Resistance bands with flag off:
   "Set up bands" (→ Bands screen, reload on focus) / "Use all five" / cancel.
3. Remove days per week: DaysPerWeekStepper, TrainingPreferences stepper, Settings summary,
   week-streak motivation lines + weekStreak, store weeklyTarget (stats, completion, instrumentation,
   users repo), engine UserProfile.weeklyTarget + test fixtures, migration dropping
   users.weekly_target and rolled_up_stats.week_streak.

### Decisions / gotchas
- Another session (wanderlift-12) had uncommitted no-band-ladder work in packages/data, engine
  pipeline.test.ts / properties.test.ts / golden snapshot, and docs/BACKLOG.md when this track
  started. Commit only this track's files by explicit path; don't touch theirs. Engine fixture edits
  in those two test files wait until their work lands.
- Settings → Starting levels (PlacementScreen) is kept: the request was about setup only.
- Week streaks also contradict invariant 4 (no streaks), so removing them is doubly right.
