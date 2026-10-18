## Track: 37 — General-audience release (beginner → advanced)

Last updated: 2026-10-18

The plan, its scope cuts and the sub-track list (37a–37n) live in `docs/BACKLOG.md` under
"General-audience release plan (Track 37)". This file is the running log.

### Done

- [ ] (none yet)

### In progress

- 37a — Limitations. Store: add `removeLimitation`/`setUserLimitations` (replace the `source:'user'`
  set wholesale, keep `pain_report` rows), engine-free mapping of plain-language choices → tags in
  `packages/data` (so onboarding and Settings share one list). Settings: a "Limitations" group.

### Next

- 37b → 37c → 37d → 37e → 37f → 37g → 37h → 37i → 37j → 37k → 37l → 37m → 37n (order in BACKLOG).

### Decisions / gotchas

- Scope cuts are the user's (2026-10-18): no "this hurts" button on the active workout, no level-up
  offer from the active workout, no bundled demo loops (user will produce them), no account /
  device-history work.
- The limitations pipeline into the hard filter already existed (`usersRepo.buildUserProfile` →
  `getActiveLimitations` → `applyHardFilters`); the gap was UI + store write/remove only.
- The §13.1 bodyweight-bearing `medium` cap stays non-configurable (invariant 3).
- The tag review (37c) is an AI pass in a CSCS role. It is explicitly NOT the human review — keep
  saying so in the doc and the backlog.
