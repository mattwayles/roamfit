## Track: 37 — General-audience release (beginner → advanced)

Last updated: 2026-10-18

The plan, its scope cuts and the sub-track list (37a–37n) live in `docs/BACKLOG.md` under
"General-audience release plan (Track 37)". This file is the running log.

### Done

- [x] 37a — Limitations: `LIMITATION_CHOICES` (packages/data/src/limitations.ts), users.limitation_choices
      (migration 0029), `setLimitationChoices` + expansion in `buildUserProfile`; Settings → Your body →
      Limitations screen; shared `components/SettingsList.tsx` (Group/SwitchRow/NavRow/CheckRow). New tags
      `lying_supine`/`lying_prone` added to the union, not yet on any exercise (37c tags them).

### In progress

- 37b — empty `DEFAULT_ANCHORS_AVAILABLE` for new users; strip travel hints from GenerateScreen's
  equipment picker (`hint:` strings around GenerateScreen.tsx:86-110).

### Next

- 37c → 37d → 37e → 37f → 37g → 37h → 37i → 37j → 37k → 37l → 37m → 37n (order in BACKLOG).

### Decisions / gotchas

- Scope cuts are the user's (2026-10-18): no "this hurts" button on the active workout, no level-up
  offer from the active workout, no bundled demo loops (user will produce them), no account /
  device-history work.
- The limitations pipeline into the hard filter already existed (`usersRepo.buildUserProfile` →
  `getActiveLimitations` → `applyHardFilters`); the gap was UI + store write/remove only.
- The §13.1 bodyweight-bearing `medium` cap stays non-configurable (invariant 3).
- The tag review (37c) is an AI pass in a CSCS role. It is explicitly NOT the human review — keep
  saying so in the doc and the backlog.
- Limitation choices are stored as choice ids on `users.limitation_choices` (JSON `[{id, since}]`),
  NOT as tag rows, so a later change to a choice's tag mapping reaches every existing user. The
  `limitations` table stays for dated tag-level rows (pain reports, if they ever come).
- Onboarding gate = `!hasAcknowledgedDisclaimer` (first launch only). Existing installs skip it and can
  re-run it from Settings; this keeps every existing test's `acknowledgeDisclaimer` bypass valid.
