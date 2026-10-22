## Track: 46 — Field Guide filter redesign
Last updated: 2026-10-21
Files: app/src/screens/ExercisesScreen.tsx, app/src/lib/exerciseCatalog.ts (state, predicates),
app/src/lib/filterLabels.ts (human labels), tests beside each.

### Done
- [x] 46a — engine-only dimensions out, human labels, "No gear" quick chip, live "Show N moves" (commit 8044458)

### In progress
- 46b not started: first step is the MUSCLE_GROUPS / PATTERN_FAMILIES mapping (see Next).

### Next
- 46b: reorganise the sheet into four collapsible groups — "What it works" (Focus + Body area:
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
