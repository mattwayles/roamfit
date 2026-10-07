## Track: 31 — Recommended Focus + lesser-worked-muscle selection
Last updated: 2026-10-06
### Done
- [x] Engine `selection/lightMuscle.ts`: 7-day volume ranking, `recommendFocus`, `muscleDeficits` (uncommitted)
- [x] `emphasizeMuscle` (template) guarantees a slot for the lightest muscle; `selectMain` scores it (`TARGET_MUSCLE_BONUS`, `LIGHT_MUSCLE_BONUS`) and the aggregate passes never swap that pick out (uncommitted)
- [x] "Recommended Focus" card lives on Generate, under the "What are we training?" header, reading engine `recommendFocus` (moved off Today; replaces the first-cut app-side `suggestFocusMuscle`)
### In progress
- Nothing; awaiting commit + device look.
### Next
- Device pass on the card; decide whether the card should deep-link to Generate with the focus preselected.
### Decisions / gotchas
- Candidate muscles = primary mover of >=3 strength exercises (traps/forearms/adductors would otherwise win at zero).
- Muscle -> focus: >=60% of its tagged exercises in one of upper/abs/legs, else `full`. Cardio is never recommended (not a muscle group).
- Muscles reached only by laddered patterns (chest, quads, lats, hamstrings...) are not given extra slots; their ladder slot already trains them.
- `full` gets the muscle slot as *required* (all its slots are required, so optional would be trimmed first). Sessions under ~25 min fit 2-3 exercises, all ladder slots: no room, so no guarantee there.
- `recommendFocus` totals the last 7 days into upper / core / legs / cardio (muscle credit summed into its area; conditioning exercises count to cardio only) and recommends the lowest total, ties in that order. Full body when there is no strength work in the window (cardio alone does not count), incl. a fresh install, so the card is always shown. Replaced the earlier 48h focus-skip rule.
- Quick Session and Cardio are untouched.
