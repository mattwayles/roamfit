## Track: 37 — General-audience release (beginner → advanced)

Last updated: 2026-10-18

The plan, its scope cuts and the sub-track list (37a–37n) live in `docs/BACKLOG.md` under
"General-audience release plan (Track 37)". This file is the running log.

### Done

- [x] 37a — Limitations: `LIMITATION_CHOICES` (packages/data/src/limitations.ts), users.limitation_choices
      (migration 0029), `setLimitationChoices` + expansion in `buildUserProfile`; Settings → Your body →
      Limitations screen; shared `components/SettingsList.tsx` (Group/SwitchRow/NavRow/CheckRow). New tags
      `lying_supine`/`lying_prone` added to the union, not yet on any exercise (37c tags them).

- [x] 37b — `DEFAULT_ANCHORS_AVAILABLE = []` (new users own nothing); the old full list is now
      `FIXED_POINT_ANCHORS` (engine tests' "has everything"); travel hints gone from Generate's
      equipment picker and from 14 exercise `setup` lines (RV / truck / tree / tailgate / picnic table).

- [x] 37c — contraindication review: `docs/review/contraindications-review-2026-10.md`; 93 exercises,
      138 tag edits (131 added, 7 removed); guards in `packages/data/src/contraindications.test.ts`;
      every choice × focus × equipment still yields a full session (limitationChoices.test.ts).

- [x] 37d + 37e — `lib/anchorSafety.ts` + `components/AnchorSafetyGuide.tsx` + `AnchorSafetyScreen`;
      `lib/glossary.ts` + `GlossaryScreen` (search); Settings → Learn group.

- [x] 37f engine — `src/preferences.ts`: goal / rest / variety / recovery / pace / warm-up, defaults =
      pre-37f behaviour exactly; goal applied at prescription (`applyTrainingToMainEntry`), never to
      stored progression state; pace via `applySessionResult(..., { sessionsPerStep })` and
      `applyAccessorySessionResult(..., sessionsPerStep)`.

### In progress

- 37f store/app — next: migration 0030 (`users.training_prefs` JSON + `exercise_state.micro_consecutive_hits`),
  `UserRecord.trainingPreferences`, `buildUserProfile` passes `training`, completion passes
  `sessionsPerStepFor(pace)` to both verdicts, ApprovalScreen add-exercise applies
  `applyTrainingToMainEntry`. Then the Settings screen, then the learned changeover time.
- (superseded plan text) 37f — training preferences. Engine: a `TrainingPreferences` type on `UserProfile` (optional;
  absent = today's constants), read by progression ranges, rest, cooldown windows, recovery window,
  progression pace, warm-up/cool-down minutes, changeover time. Store: one JSON column
  `users.training_prefs` (migration 0030). App: Settings → Training → "Training preferences" screen.

### Next

- 37f → 37g → 37h → 37i → 37j → 37k → 37l → 37m → 37n (order in BACKLOG).

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
- Existing users keep their stored `anchors_available`; only `ensureUser` for a new row changed. Any test
  that seeds a plan and depends on its first exercise must set `FIXED_POINT_ANCHORS` itself (see
  WorkoutScreen.restResume.test.tsx).
- `packages/data/scripts/migrate_library.py` still contains the old travel copy — it is a historical
  one-shot migration, not a generator; exercises.json is edited directly (python json.dump indent=2 +
  trailing newline reproduces the file byte-for-byte).
- Glossary terms to add when their features land: "Band stacking" (37i), naming/colouring bands in
  Settings (37i, the "Band (B1 to B5)" entry), Push and Pull in the "Focus" entry (37j).
- Goal ranges are OFFSETS on the 8-12 / 20-45s ladder (strength -3 reps/-5s, endurance +7/+10s,
  muscle +1 set), so each rung stays a one-step change and switching goal never re-denominates state.
