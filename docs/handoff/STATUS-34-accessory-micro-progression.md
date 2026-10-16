## Track: 34 — accessory micro-progression + faster timed holds
Last updated: 2026-10-16
### Done
- [x] engine: timed holds climb 5s per qualifying session instead of 1s
  (`PROGRESSION_TIME_STEP_SEC`, used by `microAdvance`/`microRegress`, clamped to the range so an
  existing off-grid target like 23s goes 23→28→…→45). 20→45s is 5 sessions, like 8→12 reps.
  ladderPosition expectations updated (it replays microAdvance, so it follows automatically).
### In progress
2. engine: `progression/accessory.ts` — `seedAccessoryMicro` (from an entry's prescription) and
   `applyAccessorySessionResult` (same verdict rules as `applySessionResult`, same
   `microAdvance`/`microRegress`); `ExerciseState.accessoryMicro`/`accessoryMisses`;
   `prescribeAccessory({ micro })` prescribes straight from it; pipeline wiring; tests.
### Next
3. store: migration 0028 adds `exercise_state.micro_rep_target/micro_tempo_sec/micro_rest_sec/
   micro_sets/micro_consecutive_misses` (band stays `working_band`); `rowToState`; completion runs
   accessory progression for main, non-family, non-cardio entries; `generate()` first seeds any
   accessory whose last completed session predates this (replays that session's verdict); tests.
4. app: Approval Add exercise passes the micro; BACKLOG; status done.
### Decisions / gotchas
- "Accessory" = a main entry with no `progressionFamilyId`. Cardio (`pattern: 'conditioning'`) is
  excluded: it is prescribed as intervals off the day's difficulty (`CARDIO_INTERVAL_TABLE`), and a
  45s-rest strength ladder would wreck that. It keeps band memory (track 33) only.
- Never-trained accessory: first prescription still comes from the difficulty table (so the day's
  dial still means something on first exposure); its first completion seeds the micro-state from
  that prescription, clamped into the ladder's ranges (reps 8-12, 20-45s, tempo 3-4, rest 30-45,
  sets 3-4), and every session after is ladder-driven like a family exercise.
- Accessories have no "next level". Where a family levels up, an accessory moves to the next band
  heavier (BAND_ORDER) with a fresh micro-state (bottom of rep range, default pace); bodyweight or
  already at the heaviest band holds there (mastery). Where a family drops a level, an accessory
  drops one band with reps at the top of the range; at B1 / bodyweight it holds.
- Band: the stored accessory band is NOT clamped to the authored range (track 33's call). The
  user's final-set band overrides the stored band before the verdict, with the family rule's rep
  reset (heavier → bottom of range, lighter → top).
- Accessory events are not pushed into `progressionEvents` (those are family-keyed and drive
  level-up milestones); no new UI.
