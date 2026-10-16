## Track: 35 — every band exercise climbs to B5
Last updated: 2026-10-16
### Done
- [x] engine: the own-exercise ladder (`progression/accessory.ts`) runs over an open band range
  (B1-B5): reps → next band → … → B5 before any pace knob; band_up/band_down events removed;
  `isPassedRungBandExercise`, `seedPassedRungMicro`; `prescribeLaddered({ ownMicro })`; pipeline
  passes it for passed-rung band exercises; tests
### In progress
3. store: completion runs the own-ladder update (`progressAccessoryEntry`, seedFrom 'prescribed')
   for passed-rung entries (exercise's own rung index < entry.progressionLevelIdAtTime's) and leaves
   them OUT of the family verdict; they also stop writing working_band via recordExercisePerformed
   (the ladder writes it); tests in `accessoryProgression.test.ts`.
### Next
- app: none expected (Approval Add exercise uses prescribeAccessory, already open-range). BACKLOG.
### Decisions / gotchas
- User's rule (2026-10-16): the CURRENT rung keeps its authored range cap — reaching it (then
  pace, unchanged) unlocks the next rung. Passed rungs stay eligible and keep climbing bands to B5.
  Accessories: no cap at all.
- Bodyweight passed-rung exercises are unchanged (still the projected tier) — the request was
  about bands.
- Lower rungs were already eligible (`pickLadderCandidate`, 40% weight). The only thing that
  excludes one is `isDifficultyEligible` on a hard/easy day — a day-difficulty rule, untouched.
- Passed-rung entries keep `progressionFamilyId`/`progressionLevelIdAtTime` (charts read them);
  completion tells them apart by the exercise's own rung index < the entry's level index.
