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
  set the flag — 8ba700a
- [x] Step 3: days per week removed everywhere: Training preferences stepper, Settings summary,
  DaysPerWeekStepper, the two week-streak motivation lines, store weeklyTarget / weekStreak /
  effectiveWeeklyDenominator / week-target adherence, engine UserProfile.weeklyTarget; migration
  0036 drops users.weekly_target, rolled_up_stats.week_streak and its unused check date — 441b7c5

### In progress
- Nothing. Track complete pending the device pass in BACKLOG.

### Next
- Device pass (BACKLOG).

### Decisions / gotchas
- Another session (wanderlift-12) had uncommitted no-band-ladder work in packages/data, engine
  pipeline.test.ts / properties.test.ts / golden snapshot, and docs/BACKLOG.md when this track
  started. It landed as 6ca3b13 before step 2, so the tree was clean from then on. Still commit by
  explicit path in case another session is active.
- Settings → Starting levels (PlacementScreen) is kept: the request was about setup only.
- Week streaks also contradict invariant 4 (no streaks), so removing them is doubly right.
- `travel_days_this_week` is left in place (write-only now); parked in BACKLOG rather than widened
  into this track.
