## Track: 2-engine — The generation engine
Last updated: 2026-08-30

### Done
- [x] Core types (`packages/engine/src/types.ts`): `EngineClock`/`Rng` injection seams,
  `UserProfile`/`ExerciseState`/`ProgressionState`/`SessionHistoryRecord`/`UserState`,
  `GenerationRequest`, `SessionPlan`/`SessionEntry`. — `0582505`
- [x] Seeded RNG (`rng.ts`, mulberry32 + `seedFromString`) and `local_date` calendar math
  (`dates.ts`, UTC-midnight-anchored so it never touches wall-clock time). — `0582505`
- [x] `docs/decisions/0001-blocked-scope.md` — BLOCKED/PREFERRED/novelty apply to `role: main`
  only; warmup/cooldown use light rotation. — `0582505`
- [x] §5.1 step 1 hard filters (`filters/hardFilters.ts`): equipment, anchor, injury filters +
  `effortCapForExercise` (§13.1 bodyweight_bearing cap). 7 tests. — `e985b54`
- [x] §5.5 focus templates (`template/focusTemplate.ts`): upper/legs/abs/full pattern slots,
  `buildQuickSessionTemplate` for §9.5. 7 tests. — `42b567e`
- [x] **§5.2 selection rules are DONE**, not "not yet started" (a prior status update went stale
  — corrected here). `selection/`: `candidates.ts` (sessionsAgo/tier/enjoyment/novelty/
  suppression derivation), `volume.ts` (trailing muscle volume, over-worked/untrained/low,
  recent-hard-muscle, same-focus-yesterday), `mainSelection.ts` (the full rule set: BLOCKED,
  SOFT-only-when-uncoverable, novelty pass, over-worked-never-primary-mover, 48h recovery cap,
  enjoyment avoid-≤2/favorites-cap, REPEATEDLY-SKIPPED suppression, ≥70% PREFERRED / ≥50% band
  aggregate passes, PATTERN GAP band-exception-or-stated-imbalance), `warmupCooldown.ts` (ADR
  0001 light rotation). 24 tests, one named per rule. — `62ba67b`
- [x] **§6 progression is DONE**. `progression/`: `ladder.ts` (stable-`level_id` lookups, never a
  positional index — invariant 5), `micro.ts` (§6.2 band vs bodyweight micro-progression order,
  advance and regress, `isAtBottomMicroStep`), `calibration.ts` (§6.5 cold-start, full-level jumps
  for the first 3 sessions), `rules.ts` (§6.3 advance/regress/drop-a-level dispatch, §6.7 mastery
  → `mastery_pr_check` event instead of a dead end), `comeback.ts` (§9.4 gap detection +
  `applyComebackToProgressionStates`, the single code path §9.9 Recovery Week must also call for
  its `'week'` tier). 33 tests. — `725a1b5`
- [x] **Architecture clarification, recorded as a decision (see below) rather than silently
  applied**: for the 8 laddered-family patterns, a slot's exercise is NOT chosen by
  `selectMain`'s §5.2 variety machinery — it comes directly from `ProgressionState.levelId`.
  `selectMain` (as built and tested) governs only the non-laddered/accessory pattern slots
  (isolation patterns, abs's `anti_rotation`/`flexion`/`lateral_flexion`, legs isolation/calf,
  finisher slots) plus warmup/cooldown. This is *not yet wired into a pipeline* — see "Next".

### In progress
- **`pipeline.ts` does not exist yet.** Nothing in `index.ts` exports `generateSession` — it's
  commented out with a pointer to this file, exactly as before. The stage modules are all built
  and independently tested; wiring them together is the next unit of work.
- Immediate next action: build `progression/resolveSlot.ts` (new file) —
  `resolveProgressionSlot(slot, family, progressionState, library, hardFilteredPool)`:
  1. Look up the exercise at `progressionState.levelId` for the family matching `slot.patterns[0]`.
  2. If it's in `hardFilteredPool` (survives anchor/injury/equipment), use it directly — this is
     the normal case, session after session, and must NOT be treated as a BLOCKED repeat.
  3. If it fails a hard filter (e.g., current level's variant needs an anchor the user has
     disabled), walk down the ladder via `prevLevel` to the nearest level whose exercise survives
     the hard filters, for THIS SESSION ONLY — do not persist a level change from this
     substitution. Flag it (add `substituted_for`/`unplanned`-style fields to `SessionEntry` —
     **not yet added, needed now**) so the explanation line (step 7) can mention it.
  4. If even the bottom level fails every hard filter for that pattern, the slot is a PATTERN GAP
     like any other unfillable required slot.

### Next
1. `progression/resolveSlot.ts` (see above) — the missing link between progression state and a
   concrete per-session exercise pick for the 8 laddered patterns.
2. Add `substituted_for?: string` and `unplanned?: boolean` to `SessionEntry` in `types.ts` (§4.7
   documents both; they're currently missing from the engine's output type).
3. Prescription (§5.4 effort table → sets/reps-or-seconds/band/tempo/rest per entry). For
   laddered slots the *band* and *rep target* mostly come from `ProgressionState.micro` already
   (that's what micro-progression tracks); the day's chosen `effort` still governs rest/tempo/
   format (straight sets vs. superset) and, per §13.1, is capped to `normal` on
   `anchor_class: bodyweight_bearing` (already computed in `filters/hardFilters.ts`,
   `effortCapForExercise` — reuse it here, don't recompute). For non-laddered slots, prescription
   comes straight from the §5.4 table at the (possibly capped) effort.
4. Time fit (§5.6 budget formula, ±10% target, exercise-count sanity check) — add/drop from the
   tail of the priority-ordered slot list; required slots are never dropped (a shortfall is a
   PATTERN GAP or an explanation note, not a silent omission).
5. Explain (§5.8) — deterministic template string; must name any progression substitution
   (from step 1 above), any 48h-recovery band drop, any comeback treatment, any level-up/mastery
   PR event, and the PATTERN GAP note when present.
6. Wire `pipeline.ts` → `generateSession(library, families, userState, request, clock, rng)`.
   Re-enable the `generateSession` export in `index.ts`.
7. Quick Session (§9.5) and comeback (§9.4) — confirm both run through the *same* `pipeline.ts`
   call with different inputs (minimal template + fixed 7min + `normal` effort for Quick Session;
   `assessComeback` + `applyComebackToProgressionStates` + `volumeMultiplier` applied to
   prescribed sets for comeback), not parallel code paths. This should fall out of the pipeline
   design in step 6 rather than needing new branches.
8. Golden tests (fixed seed + fixed user state → committed expected JSON), property tests
   (contraindicated/disabled-anchor/time-budget/effort-cap/warmup+cooldown-present/push-pull-
   balance invariants over randomized inputs), 30-session simulation test, <50ms benchmark.

### Decisions / gotchas
- **Laddered-pattern slots bypass `selectMain`** (see "Architecture clarification" above). This
  was not obvious from §5.1's step ordering alone ("SELECTION" then "PROGRESSION" reads as if
  selection picks an exercise and progression then adjusts its level) but is the only reading
  consistent with progressive overload actually working: the same horizontal-push exercise
  recurring session after session while the user sits at one level is the *intended* behavior,
  not a BLOCKED violation. `selectMain`'s BLOCKED/PREFERRED/novelty/enjoyment rules are exactly
  what the prototype already does for *its* flat, level-less pool — in RoamFit they still apply,
  just scoped to the patterns that don't have a ladder (§6.6's accessory patterns), which is
  where the prototype's model still holds unmodified.
- **BLOCKED/PREFERRED session-count windows and OVER-WORKED/UNTRAINED thresholds** are ported
  from the prototype (`~/.claude/skills/daily-workout/scripts/workout_db.py`, symlinked from
  `ai-monorepo/skills/health/daily-workout`), since spec.md states the rule but not the numbers:
  `HARD_COOLDOWN_SESSIONS=2`, `SOFT_COOLDOWN_SESSIONS=5`, over-worked = 7-day trailing volume
  >1.5× mean, untrained/low = 14-day trailing volume, low threshold <3 sets.
- **Progression's own working rep/hold range and bodyweight micro caps are not numeric in
  spec.md.** Resolved (see `progression/constants.ts` docblock) to the §5.4 `normal` row as an
  effort-independent baseline: reps 10-12, tempo 3s (→4s cap), rest 45s (→30s floor), sets 3
  (→4 cap). Chosen because progression must be independent of the day's chosen effort (§5.4:
  "effort for today, not absolute difficulty... a property of their progression level"), and
  `normal`'s numbers are also exactly the schema's implied defaults. Timed exercises use a
  separate 20-45s hold range (not reps) since a 10-12 rep window is meaningless as a duration.
- **§6.2's band vs. bodyweight order is read as linear, not cyclic**, for bodyweight (reps → one
  tempo bump → one rest cut → one sets bump → next level) but genuinely cyclic for band (reps →
  band+1 with reps reset → repeat until the exercise's own suggested band range — e.g. "B1-B2" —
  is exhausted → next level). A given exercise's *own* `band` field range caps how high
  micro-progression climbs before a level change is due — it is not global B1-B5.
- **§6.5 calibration's "first three sessions" is tracked via `consecutiveHits + consecutiveMisses`
  while `calibrating: true`**, since `ProgressionState` (§4.5) has no dedicated calibration-session
  counter. Both fields resume their normal §6.3 meaning once calibration ends. This is a schema
  reuse, not a new field — flagging in case Wave 3's persistence schema wants an explicit counter
  instead for clarity; either works, this just avoids widening §4.5's documented shape.
- `hamstring-curl`/`tke` tagged `hip_extension` (carried-forward issue #4) — harmless, confirmed:
  `hip_extension` is a valid non-laddered `Pattern`, used only by the legs isolation slot.
- Conditioning finishers (`tier: fill`, carried-forward issue #5) — the `full` template's
  finisher slot (`isFinisher: true`) already draws from `tier === 'fill'` regardless of pattern in
  `selection/mainSelection.ts`'s `eligibleForSlot`.
- Engine package depends on `@roamfit/data` explicitly in `package.json` now (previously only
  resolvable via the npm workspace symlink with no declared dependency).
- No new dependencies added beyond what Wave 1 already installed.
- **Process note for whoever resumes next:** commit with explicit pathspecs
  (`git commit -m "..." -- <paths>`, not `git add -A`) and confirm `npm run check` is green on the
  *working tree*, not just on what's staged, before committing — this status file must be updated
  as part of the same commit sequence whenever a stage lands, so a fresh agent never sees a "not
  started" note for work that's actually done.

### Ambiguities for a human/product call (not silently decided)
- **Selection aggregate resolution order** (unchanged from before): if PREFERRED%, band%, and the
  40% favorites cap can't all be satisfied on a thin accessory-pattern pool, current order is
  PATTERN GAP avoidance → band ratio → PREFERRED ratio → favorites cap, with novelty opportunistic
  throughout. Implemented in `selection/mainSelection.ts`; revisit if golden/simulation tests
  surface a bad case.
- **Progression substitution when a laddered exercise fails a hard filter** (see "In progress"
  above) — walking down the ladder for a session-only substitution is the plan, not yet built or
  tested. Worth a second opinion: an alternative would be to treat it as a PATTERN GAP immediately
  rather than silently substituting a lower level, on the theory that a hard-filter failure at the
  user's actual level is itself information worth surfacing. Leaning toward "substitute and note
  it in the explanation line" since spec's step-7 explanation is explicitly meant to carry exactly
  this kind of "what changed and why," but flagging since it's a real design choice.
