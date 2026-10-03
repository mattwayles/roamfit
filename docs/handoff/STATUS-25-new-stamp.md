## Track: 25 — New passport stamp on the completion screen
Last updated: 2026-10-03
### Done
- [x] Whole feature, one commit (see `git log`): `lib/newStamp.ts` (bounded lookup), `components/NewStampCard.tsx`
  (flight, squash, ink ring, tap-to-restamp), `SummaryScreen` wiring, `cueStampImpact` + `haptics.rigid`,
  `stamp-thunk.wav` (`tools/make_stamp_sound.py`), timeline stamp slot. Tests alongside.
### In progress
- Nothing.
### Next
- Device pass (BACKLOG, "New passport stamp on Completion").
### Decisions / gotchas
- The stamp used to land silently because the `passport_geocode` job only ran on a later screen focus,
  so FINISH now drains the device queue itself (`lookupNewStamp`), concurrently with the celebration.
  It is raced against a 6s timeout and never throws; offline / no permission / no fix = no stamp here,
  and the queue still retries for Journey.
- The `new_city` milestone is the signal. `completion.ts` writes none for it, so Summary never reloads
  milestones after the lookup — otherwise the old quiet "New place:" chip would duplicate the stamp.
- "Heck yes!" waits for the stamp only when Passport is on, and releases at once when nothing is found.
- No new dependencies. One new asset: `app/assets/audio/stamp-thunk.wav`.
