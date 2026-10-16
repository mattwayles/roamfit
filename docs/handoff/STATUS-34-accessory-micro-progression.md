## Track: 34 — accessory micro-progression + faster timed holds

Last updated: 2026-10-16

### Done

- [x] engine: timed holds climb 5s per qualifying session instead of 1s
      (`PROGRESSION_TIME_STEP_SEC`, used by `microAdvance`/`microRegress`, clamped to the range so an
      existing off-grid target like 23s goes 23→28→…→45). 20→45s is 5 sessions, like 8→12 reps.
      ladderPosition expectations updated (it replays microAdvance, so it follows automatically).
- [x] engine: `progression/accessory.ts` — `seedAccessoryMicro`, `applyAccessorySessionResult`,
      `progressesAsAccessory`; `ExerciseState.accessoryMicro`/`accessoryMisses`;
      `prescribeAccessory({ micro })`; pipeline wiring; tests (see git log)
- [x] engine: an accessory switched to a heavier band for every set with every set met keeps its
      rep target (dabe62e)
- [x] store: migration 0028 (`micro_*` columns), `rowToState` → `accessoryMicro`/`accessoryMisses`,
      `recordAccessoryProgression`, completion runs `progressAccessoryEntry` for accessory entries,
      `seedAccessoryProgressionFromHistory` called at the top of `generate()`; tests
      (`accessoryProgression.test.ts`)
- [x] app: Approval Add exercise passes `micro: state.accessoryMicro`; test. BACKLOG: replaced the
      track-33 parked item with a device-pass + loose-ends item.

### In progress

- nothing — track complete. Jest-verified only.

### Next

- see BACKLOG "Accessory ladder — device pass owed, and two loose ends".

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
  reset (heavier → bottom of range, lighter → top) EXCEPT a heavier band held on every set with
  every set meeting target keeps the rep target (`finalBandHeldThroughout`) — otherwise the user's
  3x12-on-B2 came back as 3x9 on B2, easier than what they just did. Deliberate divergence from
  the family path, which still resets.
- Accessory events are not pushed into `progressionEvents` (those are family-keyed and drive
  level-up milestones); no new UI.
- The finished-on band counts as a change only when it differs from what THIS session prescribed
  (`progressAccessoryEntry`), so following a 48h recovery band drop is not adopted as the user's
  band. A first-ever seed at completion takes the remembered working band for the same reason;
  the history seed takes the entry's band (no working bands existed then).
- History seeding lives in `completion.ts` (it shares `summarizeEntry`) and runs in `generate()`
  every time; idempotent, one query once everything is seeded.
