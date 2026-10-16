## Track: 36 — Recommended Focus weights sets by logged reps and band

Last updated: 2026-10-16

### Done

- [x] engine: `SessionHistoryEntry.loggedSets` (completed sets only: reps, per-side seconds, band
      actually used); `weightedSetCredit`/`entryWork` in `selection/lightMuscle.ts`, constants in
      `selection/constants.ts`; `weeklyAreaVolume` uses it; tests in `lightMuscle.test.ts` (29d03e9)
- [x] store: `getHistoryForGeneration` fills `loggedSets` for completed sessions' main entries
      (one set_logs query, completed sets only, reps/seconds actual else prescribed, band actual else
      the entry's); seconds halved for unilateral entries; `weightedFocusHistory.test.ts`. BACKLOG item
      "Weighted set volume" added (device pass + the planned-set rules left alone).

### In progress

- nothing — track complete. Jest-verified only.

### Next

- see BACKLOG "Weighted set volume — device pass owed…".

### Decisions / gotchas

- User request (2026-10-16): "weight sets by logged reps and band". Scope is the Recommended Focus
  (`weeklyAreaVolume`) only. `trailingVolume` is untouched: OVER_WORKED / UNTRAINED / LOW thresholds
  are calibrated in planned sets (LOW < 3 sets), and the generation lean (`lightestMuscles`) reads it.
- Set weight = (reps / 10, or per-side hold seconds / 30) × 1.25^(band steps above the bottom of the
  exercise's AUTHORED range), capped at 3. Bodyweight band factor 1. Relative to the exercise's own
  range, not absolute band load: an absolute scale makes a B1 lateral raise worth a fraction of a B4
  squat, so upper (small muscles, light bands) would read lightest nearly every week.
- Only completed sets count once logs exist — a planned set that was skipped / not reached is 0.
  An entry with no `loggedSets` (legacy caller) keeps the old planned-set count.
- Cardio has no reps/band to weight: it counts 1 per completed set.
- `secondsActual` on a unilateral hold is both sides summed (WorkoutScreen convention); the store
  halves it so the engine sees per-side seconds. Reps are already per side.
