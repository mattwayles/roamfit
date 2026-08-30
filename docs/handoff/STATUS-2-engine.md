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
  finisher slots) plus warmup/cooldown.
- [x] `progression/resolveSlot.ts` — bridges progression state to a concrete per-session exercise
  for a laddered slot, with a session-only ladder-walk-down substitution when the current level's
  exercise fails a hard filter. 4 tests. — `f0ac1ef`
- [x] §4.7's `substitutedFor`/`unplanned` added to `SessionEntry` (`types.ts`). — `f0ac1ef`
- [x] §5.4 prescription (`prescription/`): `effortTable.ts` (deterministic picks within each
  effort row's ranges, documented), `prescribe.ts` — laddered exercises prescribed from
  `ProgressionState.micro` directly, accessory exercises from the effort table, both applying the
  §13.1 cap and a 48h-recovery band-drop, plus a `setsMultiplier` seam for the §9.4/§9.9 volume
  cut. 6 tests. — `f0ac1ef`
- [x] §5.6 time fit (`timefit/`): `formulas.ts` (budget/per-exercise-seconds/count-sanity-check
  arithmetic, matches the SKILL.md worked example exactly), `fitSession.ts` (adds optional slots
  until the next would overshoot, never drops a required one). 17 tests. — `f0ac1ef`
- [x] §5.8 explanation line (`explain/explain.ts`) — deterministic, composes from structured
  facts (recovery/PATTERN GAP/substitution/level-up/mastery/novelty/calibration/comeback), never
  empty. 11 tests. — `b77d533`
- [x] **`pipeline.ts` wires all seven stages into `generateSession`** (+ `generateQuickSession`
  for §9.5), both exported from `index.ts`. Splits template slots into laddered (resolved via
  `resolveSlot.ts`) vs. accessory (resolved via `selectMain`), applies §9.4 comeback as a
  pre-transform of `progressionStates` + a prescription-time volume multiplier, and assembles the
  explanation line from everything the stages produced. 8 end-to-end smoke tests against the real
  library (all 4 foci from cold start, determinism, a limitation hard filter, Quick Session's
  shape, the comeback notice, the bodyweight-only PATTERN GAP, a <50ms benchmark). — `fb42999`

### In progress
- **The full §5.1 pipeline is wired and live**: `pipeline.ts` exports `generateSession` and
  `generateQuickSession`; both are re-exported from `index.ts`. All seven stages run end to end
  against the real 200-exercise library and 8 families (`pipeline.test.ts`, 8 smoke tests: all 4
  foci from cold start, determinism, the shoulder-limitation hard filter, Quick Session's shape,
  the comeback notice, the bodyweight-only PATTERN GAP, and a <50ms benchmark — all green).
- Immediate next action: golden/property/simulation tests (brief's item 10, the actual done
  criterion — the smoke tests above are useful but are not a substitute for committed golden
  fixtures or the 30-session simulation).

### Next
1. **Golden tests** — fixed seed + fixed cold-start (or specific mid-progression) user state →
   commit the exact expected `SessionPlan` JSON as a fixture, assert `generateSession` output
   matches byte-for-byte. Cover: a cold-start `upper` session, a mid-ladder `legs` session with
   some history (exercises non-null in exerciseStates), a `hard` `full` session with a finisher,
   and a comeback-triggered session. Bump `ENGINE_VERSION` (`version.ts`) if a later change
   deliberately alters output — that's what makes these fixtures a real regression gate for
   Wave 3+ refactors, per CLAUDE.md invariant 5's spirit and §4.6's `engine_version`.
2. **Property tests**, generating many randomized `(request, userState)` combinations (seeded, so
   still reproducible) and asserting invariants hold for *every* one: never a contraindicated
   exercise; never a disabled-anchor exercise (especially `bodyweight_bearing` when not enabled);
   never exceeds ±10% of target (or note why — a thin pool can legitimately fall short, see
   `timefit/fitSession.ts`'s `withinTenPercent`); never `hard` effort on an
   `anchor_class: bodyweight_bearing` entry; always has exactly one warmup and one cooldown
   entry when the role pools are non-empty (they are, for the real library); `upper` sessions at
   ≥25min keep push/pull pattern counts equal in the *final* main list, not just the template
   (`focusTemplate.test.ts` already covers this at the template-slot level, but a property test
   should confirm it survives selection/progression/time-fit too, since time-fit could in
   principle drop an optional push slot without a matching pull drop).
3. **30-session simulation test** — a synthetic user run through `generateSession` 30 times in a
   row, feeding each session's output back into the next call's `history` (and driving
   `applySessionResult`/calibration by scripting plausible performance each time, e.g. "usually
   hits top of range"). Assert: levels generally rise over the run (at least a few `level_up`
   events across the 8 families), variety holds (no single main exercise appears in a large
   fraction of sessions), no pattern is completely starved (every required pattern appears at
   least once across 30 sessions for foci that were requested), no muscle group's trailing volume
   stays chronically >1.5x mean for the whole run (the OVER-WORKED cap should visibly correct it
   session to session). This is the test most likely to catch an interaction bug the unit tests
   structurally can't (e.g., `selectMain`'s aggregate passes fighting the OVER-WORKED filter over
   many sessions).
4. Once golden/property/simulation land, cross-check the "Done criteria" list in
   `docs/handoff/wave-02-engine.md` manually — declaring the wave done in `docs/ORCHESTRATION.md`
   is the orchestrator's call, not this track's, but this status file should say plainly whether
   every criterion is met.
5. Nice-to-have, not blocking: `mastery_pr_check` and Recovery-Week-triggered-explicitly (as
   opposed to auto-detected via gap) are not yet surfaced through `generateSession` — see
   "Ambiguities" below. Revisit if a golden/property test exposes a real gap, otherwise Wave 3
   (which owns session completion, where mastery PR checks actually get evaluated) can call
   `progression/rules.ts` and `progression/comeback.ts` directly without needing pipeline changes.

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
- **Progression substitution when a laddered exercise fails a hard filter** — now built and
  tested (`progression/resolveSlot.ts`, wired into `pipeline.ts`, named in the explanation line).
  Worth a second opinion still: an alternative would be to treat it as a PATTERN GAP immediately
  rather than substituting a lower level, on the theory that a hard-filter failure at the user's
  actual level is itself information worth surfacing rather than smoothing over. Leaning toward
  "substitute and note it" since §5.8's explanation line is explicitly meant to carry exactly this
  kind of "what changed and why," but flagging since it's a real design choice, not a spec-given
  one.
- **§6.7 mastery PR-checks and an explicitly-triggered Recovery Week are not surfaced through
  `generateSession`.** `progression/rules.ts`'s `mastery_pr_check` event and
  `progression/comeback.ts`'s `'week'` tier both exist and are tested in isolation, and
  `pipeline.ts` always passes `masteryPrChecks: []` to the explanation composer with a comment
  saying why. Rationale: both are evaluated from *actual performance*, which only exists at
  session completion (Wave 3's territory) — generation has no performance to check yet. If Wave 3
  wants the *next* generated session to open with "chasing a new best on X," it should call
  `progression/rules.ts` at completion, store the resulting event, and pass it into
  `generateSession`'s explanation inputs on the next call — `composeExplanation` already accepts
  `masteryPrChecks`, so no engine change should be needed there, just a caller-side wire-up.
  Flagging in case this reads as a gap in the "done criteria" rather than an intentional wave
  boundary.
- **Recovery treatment is per-entry, not a strict "at most one exercise" count** across the whole
  session (see `prescription/prescribe.ts`'s docblock) — every main entry whose primary muscle
  overlaps a muscle trained hard in the last 2 days gets its band dropped and effort capped below
  `hard`, independently. §5.2's literal text ("capped at one exercise") suggests a stricter
  session-wide count; the accessory-selection layer (`selectMain`) does enforce something closer
  to that count via its scoring penalties, but laddered slots have no alternative exercise to swap
  for recovery purposes (the level's exercise is fixed), so a strict global count isn't always
  achievable there anyway. Documented as a simplification, not a silent deviation.
