## Track: 2-engine — The generation engine
Last updated: 2026-08-30

### Done
- [x] Core types (`packages/engine/src/types.ts`): `EngineClock`/`Rng` injection seams,
  `UserProfile`/`ExerciseState`/`ProgressionState`/`SessionHistoryRecord`/`UserState`,
  `GenerationRequest`, `SessionPlan`/`SessionEntry`. — `0582505`
- [x] Seeded RNG (`rng.ts`, mulberry32 + `seedFromString`) and `local_date` calendar math
  (`dates.ts`, UTC-midnight-anchored so it never touches wall-clock time). — `0582505`
- [x] `docs/decisions/0001-blocked-scope.md` — BLOCKED/PREFERRED/novelty apply to `role: main`
  only; warmup/cooldown use light rotation (exclude only the immediately-previous pick, drop the
  exclusion entirely if the pool would go empty). — `0582505`
- [x] §5.1 step 1 hard filters (`filters/hardFilters.ts`): equipment preference, anchor
  eligibility (§13.1 bodyweight_bearing-off-by-default falls out of this — those anchors just
  aren't in `anchorsAvailable` until enabled), injury/contraindication removal with expiry, plus
  `effortCapForExercise` (§13.1: `hard` → `normal` on `anchor_class: bodyweight_bearing`,
  regardless of the day's chosen effort). 7 tests. — `e985b54`
- [x] §5.5 focus templates (`template/focusTemplate.ts`): priority-ordered pattern slots for
  upper (full + <25min compressed form), legs, abs (rotates lead pattern off session history,
  never all-flexion), full (adds a finisher slot when `hard` or ≥40min). `buildQuickSessionTemplate`
  takes the first 3 required-then-optional slots for §9.5. 7 tests. — `42b567e`

### In progress
- Selection stage (`selection/`) — not yet started. This is the densest part (§5.2, 11 named
  rules) and the next thing to build. Plan:
  - `selection/candidates.ts` — build `Candidate[]` per slot (sessionsAgo, performCount,
    enjoyment, isNovel, isSuppressed) from `UserState.history` + `UserState.exerciseStates`.
    Constants ported from the prototype's `workout_db.py` (confirmed exact, not guessed):
    `HARD_COOLDOWN_SESSIONS = 2` (BLOCKED = used in last 2 main-role sessions for this
    exercise), `SOFT_COOLDOWN_SESSIONS = 5` (SOFT = used 3–5 sessions ago; PREFERRED = not used
    in last 5). Trailing volume: 7-day window for OVER-WORKED (`>1.5×` mean sets/muscle,
    primary=1 credit/secondary=0.5), 14-day window for UNTRAINED (0 sets) / LOW (<3 sets).
  - `selection/mainSelection.ts` — apply, per slot in template priority order: BLOCKED exclusion
    → suppressed (REPEATEDLY-SKIPPED 30-day, `suppressedUntil`) exclusion → 48h recovery
    (anything trained hard in last 2 days: drop a band size + cap at one exercise for those
    muscles, no `hard` on same-focus-yesterday muscles) → OVER-WORKED cap (≤1 exercise, never
    primary mover) → UNTRAINED/LOW priority boost → novelty (≥1 never-performed exercise per
    session when one fits *any* slot) → enjoyment tie-break (avoid ≤2 unless it's the only slot
    filler; cap favorites, rated ≥4, at ~40% of main) → ≥70% PREFERRED / ≥50% band-equipment
    checks applied as a whole-session validation after slot-fill, with a fallback substitution
    pass if either falls short → PATTERN GAP detection (a required slot with zero eligible
    exercise after all the above — state it, don't drop it silently).
  - `selection/warmupCooldown.ts` — light rotation per the ADR, not the full BLOCKED machinery.
  - Land tests per rule, named for the rule (e.g. `'BLOCKED — never programs an exercise used in
    the last 2 sessions'`).

### Next
1. Selection stage (see above) — likely 2-3 commits given density (candidates+BLOCKED/PREFERRED
   first, then recovery+volume+novelty+enjoyment, then PATTERN GAP + warmup/cooldown rotation).
2. Progression (`progression/`): ladder lookup by stable `level_id` (never array index), §6.2
   micro-progression (band vs bodyweight orders differ), §6.3 advance/regress/drop-a-level, §6.5
   cold-start calibration (first 3 sessions, full-level jumps), §6.7 mastery (best-set PR check
   in place of a level change at max level), §9.4 comeback (7-day: regress 1 micro-step/family +
   cut volume ~20%; 21-day: re-enter calibration) — comeback must literally call the same
   calibration/regression code Recovery Week (§9.9) will call in Wave 5, not a parallel path.
3. Prescription (§5.4 effort table → sets/reps/band/tempo/rest per entry), respecting the §13.1
   cap already computed in step 1.
4. Time fit (§5.6 budget formula, ±10% target, exercise-count sanity check) — add/drop from the
   tail of the priority-ordered slot list; required slots are never dropped (a shortfall there is
   a PATTERN GAP or a note in the explanation, not a silent omission).
5. Explain (§5.8) — deterministic template string, must name what changed vs. last time when
   acting on repeated feedback.
6. Wire `pipeline.ts` → `generateSession(library, userState, request, clock, rng)`. Re-enable the
   `generateSession` export in `index.ts` (currently commented out with a pointer to this file).
7. Golden tests (fixed seed + fixed user state → committed expected JSON), property tests
   (contraindicated/disabled-anchor/time-budget/effort-cap/warmup+cooldown-present/push-pull-
   balance invariants over randomized inputs), 30-session simulation test, <50ms benchmark.

### Decisions / gotchas
- **BLOCKED/PREFERRED session-count windows and OVER-WORKED/UNTRAINED thresholds are not stated
  numerically in spec.md** — spec says "used within the last N sessions" and "trailing mean"
  without N or the window. Resolved by reading the prototype source
  (`~/.claude/skills/daily-workout/scripts/workout_db.py`, symlinked from
  `ai-monorepo/skills/health/daily-workout`) since §5.2 is specified as ported verbatim from it:
  `HARD_COOLDOWN_SESSIONS=2`, `SOFT_COOLDOWN_SESSIONS=5`, over-worked = 7-day trailing volume
  >1.5× mean, untrained/low = 14-day trailing volume. Use these exact constants in `selection/`.
- **§5.2's "≥50% of main work on bands" and "≥70% PREFERRED" are session-level aggregate
  constraints, not per-slot rules.** Current plan is to fill slots by priority first, then check
  both aggregates and do a substitution pass (swap a fill/soft/bodyweight pick for a
  preferred/band alternative in the same pattern) if short. Not yet implemented — if the
  substitution pass turns out to fight the enjoyment tie-break or the 40% favorites cap, that's
  worth flagging back here rather than silently picking a resolution order.
- `hamstring-curl`/`tke` are tagged pattern `hip_extension` per carried-forward issue #4 — this is
  harmless for the engine: `hip_extension` is already a valid `Pattern` enum member (§4.1) used
  for the legs isolation slot (`legs.isolation`), it's just not one of the 8 laddered families
  (correctly — it's accessory, micro-progression only per §6.6). No code change needed; confirmed
  in template stage.
- Conditioning finishers (carried-forward issue #5, `tier: fill` with a primary-mover pattern):
  the `full` template's finisher slot (`isFinisher: true`, `patterns: []`) is written to draw from
  `tier: fill` regardless of pattern, matching how the library actually tags them. Not yet wired
  into selection — selection must special-case `isFinisher` slots to filter by `tier === 'fill'`
  instead of a pattern match.
- Engine package now depends on `@roamfit/data` explicitly in `package.json` (it was previously
  resolvable only via the npm workspace symlink with no declared dependency — fixed since it's a
  real, load-bearing import).
- No new dependencies added beyond what Wave 1 already installed.

### Ambiguities for a human/product call (not silently decided)
- **Selection aggregate resolution order** (see above) — if PREFERRED% and band% and the 40%
  favorites cap can't all be satisfied simultaneously on a thin pool, which one yields first?
  Prototype doesn't need to resolve this because it's advisory text for an LLM; here it's code and
  must have a total order. Current lean: never violate BLOCKED/hard filters/PATTERN GAP-avoidance
  first; then ≥50% band; then ≥70% PREFERRED; then 40% favorites cap; enjoyment tie-break is
  last and only among choices that don't violate the above. Will implement this order in
  `mainSelection.ts` and note here if it needs revisiting once golden tests reveal a bad case.
