## Track: 46 — Field Guide filter redesign
Last updated: 2026-10-21 (46c done)
Files: app/src/screens/ExercisesScreen.tsx, app/src/lib/exerciseCatalog.ts (state, predicates),
app/src/lib/filterLabels.ts (human labels), tests beside each.

### Done
- [x] 46a — engine-only dimensions out, human labels, "No gear" quick chip, live "Show N moves" (commit 8044458)
- [x] 46b — four collapsible sheet groups, body-area/movement-family grouping, No gear/Band choice, human muscle names on rows (lib 30d8bba; sheet, components, tests a829c5b)
- [x] 46c — limitations switch (commit d2f02f7)

### In progress
- 46d not started: tap-the-body picker for Body area. Start by reading app/src/components/MuscleMap.tsx
  and the muscle-map data (muscleMap.ts), then add a front/back toggle picker in the "What it works"
  section writing to `filters.primary` (chips stay as the accessible fallback).

### Next
- (done) 46b: reorganise the sheet into four collapsible groups — "What it works" (Focus + Body area:
  20 muscles into ~8 groups, each expandable), "How it moves" (21 patterns into ~7 families: Push,
  Pull, Squat, Hinge, Lunge, Core, Cardio), "What you need" (No gear / Band, then setup in human
  terms), "Your fit" (difficulty, one side at a time, history). Closed sections show a summary
  ("Any" / "Legs · Glutes"); only "What it works" open by default. Start with a pure
  `MUSCLE_GROUPS` / `PATTERN_FAMILIES` mapping in filterLabels.ts (or a sibling) + a test that every
  library value lands in exactly one group, then the collapsible section component.
- 46c: replace contraindication chips with one switch "Hide moves that don't suit my limitations",
  driven by saved limitations (find the store field and reuse the engine's limitation ->
  contraindication mapping). Meaning flips from include-by-tag to exclude.
- 46d: tap-the-body picker for Body area (MuscleMap.tsx / muscleMap.ts, front/back toggle);
  chips stay as the accessible fallback.

### Decisions / gotchas
- 46a dropped from the sheet and state: anchorClass, tier, role (Section), metric, family.
  Converted to plain booleans: metric === time -> "Timed holds" (`timedHolds`);
  progression_family non-null -> "On a ladder" (`onLadder`). anchorClass (derived from anchor),
  tier and role (engine selection plumbing) and the family id chips (21 ladder ids) have no user
  browsing question and were dropped outright. Their tests are removed.
- "No gear" (`noGear`, `needsNoGear` in exerciseCatalog.ts) = equipment bodyweight AND anchor
  'none'. Bodyweight alone is wrong: 26 bodyweight records need a pull-up bar, waist-height bar,
  bench/step (body-support) or jump rope. Band records never qualify, even body-held (stance).
- Labels live in lib/filterLabels.ts, one explicit map per dimension; a test asserts every library
  value has one. Anchor wording reuses equipment.ts (Generate's checklist: "Mid band anchor point"
  + its height hint). Track 37b deliberately removed suggested objects, so no "door anchor".
  Body-held anchors take glossary phrasing ("Band under your feet").
- Booleans are `TOGGLE_KEYS`/`TOGGLE_LABELS`; shown in the sheet under "Good to know" (46b should
  fold them into their groups). Applied timed/ladder show as removable chips; noGear only as the
  quick chip (no duplicate).
- Sheet button: "Show N move(s)", "No moves match" at 0 (still closes, list shows the empty state).
- Card line 2 (`primaryMuscleLabel`) still uses formatToken ("Front delts"); only filter labels
  were in scope. Consider switching it to MUSCLE_LABELS for consistency later.
- Known full-suite flake: rerun a failing suite alone with `cd app && npx jest <file>`.
- 46b groupings (lib/filterGroups.ts, a test asserts each library value is in exactly one group):
  Body area (8): Chest; Shoulders (front/side/rear delts); Back (upper back, lats, traps, lower
  back); Arms (biceps, triceps, forearms); Core (abs, obliques); Glutes; Legs (quads, hamstrings,
  hip flexors, outer hips, inner thighs); Calves. Movement families (8): Push (horizontal, vertical);
  Pull (horizontal, vertical); Squat; Hinge (hinge, hip extension); Lunge; Core (4 anti-/flexion
  patterns); Cardio; Isolation (shoulder raises, curls, triceps ext., leg curl/extension, hips
  out/in, calf) -- single-joint patterns have no natural compound home, so one family, not
  scattered. Hamstring curl / leg extension live in Isolation rather than Hinge / Squat.
- Group chip semantics: tap fills a partial group, clears a full one; chevron beside multi-member
  groups expands to member chips (`filter-primary-<muscle>`, `filter-pattern-<pattern>`); group
  chip is `filter-group-<dim>-<id>`; partial shows "Arms 2/3" in tint, full is solid. State still
  holds individual values, so filtering is identical to tapping each member.
- Applied (quick-row) chips collapse a fully selected group to its name (`active-filter-primary-group-core`).
- Gear: "No gear" (`noGear`) and "Band" (`equipment: ['band']`) are mutually exclusive via
  `withNoGear`/`withBand` in exerciseCatalog.ts; quick chip and sheet use the same function. The
  bodyweight equipment chip is gone from the UI (it is meaningless beside No gear). Setup (anchor
  chips) is always shown, not only with Band: bodyweight moves also have anchors (pull-up bar etc.).
- Sheet layout state (open sections, expanded groups) lives in ExercisesScreen so it survives the
  sheet closing; resets only when the screen unmounts. History option label is now "Done" in the
  sheet (the quick chip still says "Completed").
- Tests: open a section first (`openSection` helper in ExercisesScreen.test.tsx) before pressing
  chips in a closed section; RNTL string toHaveTextContent is an exact match.
- 46c: the `contraindication` filter dimension is gone (state, options, labels, CONTRAINDICATION_LABELS;
  detail screen uses formatToken and is untouched). New toggle `suitsLimitations` ("Suits my limitations")
  rides TOGGLE_KEYS, so it counts in activeFilterCount, shows as a removable quick-row chip and in the
  "Your fit" summary. The switch row lives in "Your fit", default OFF (filters elsewhere start empty; no
  precedent for defaulting on). Exclusion semantics: `filterExercises(..., injury?)` calls the engine's
  `isInjuryEligible` (exported from hardFilters/index, no behaviour change), fed by
  `usersRepo.buildUserProfile(db, today).limitations` (Settings choices + unexpired pain_reports; same
  expiry rule, local_date from nowEngineClock), re-read on focus. No limitations: switch disabled, note
  "No limitations saved." plus a link that closes the sheet and navigates to the Limitations screen;
  stays enabled if already on so it can be turned off. Not filtered: anchors/equipment/disabled
  exercises (generation also gates those; this switch is limitations only).
