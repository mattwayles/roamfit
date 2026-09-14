## Track: 14 — Cardio focus
Last updated: 2026-09-13

Full approved plan (design, library targets, verification): copied below under "Plan". Work is
orchestrated by a lead agent delegating increments to sub-agents.

### Done
- [x] Step 0 — pending Quick Session work committed (9db6d3a)
- [x] Increment 1 — schema/validator/enums (34a2107): Focus gains `cardio`, Pattern gains
  `conditioning`, Anchor gains `jump-rope`; `isCardioExercise` exported from `@roamfit/data`;
  validator accepts the new values, `anchorClassFor('jump-rope')` -> `'none'`, and the
  pattern/focus travel-together + extra-focus-needs-warmup/cooldown-role rules (both vacuously
  true today); `TEMPLATE_PATTERNS` is now `Partial<Record<Focus, Pattern[]>>` so cardio's entry
  (and its warmup/cooldown coverage check) is deferred to increment 2; llm/validate.ts +
  functions/src/schemas.ts + their tests updated; hardFilters gets jump-rope
  excluded/included tests; minimal compile-only stopgaps added everywhere a `Record<Focus,...>`
  or `Record<Pattern,...>` needed a key (each commented with which increment replaces it) —
  none of them touch a UI option list or the Quick Session rotation.

- [x] Increment 2 — library tag audit (f2326f6): stripped `cardio` from primary/secondary on
  every record (20 touched); 6 of them (bw-burpee, banded-burpee, bw-sprawl, bw-squat-thrust,
  bw-jumping-jack, bw-high-knees) had `cardio` as their only `primary` and got real substitute
  muscles — quads for the 4 squat-thrust-family moves (secondary padded with chest/abs/glutes as
  applicable), calves for jumping jack, hip_flexors for high knees. Recast the 10 "moves to
  cardio" records: pattern -> `conditioning`, focus -> `['cardio']` (jumping jack/high knees keep
  `full` too, since they hold the warmup role), metric reps -> time (default_seconds 30). Tagged
  3 cooldown stretches (cd-calf-stretch, cd-hip-flexor, cd-hamstring-band) and 2 dynamic warmups
  (wu-hip-hinge, bw-squat) with an added `cardio` focus so the Cardio focus has non-empty
  warmup/cooldown pools without reclassifying them as `conditioning` — no quad-specific stretch
  exists in the library to tag (plan mentioned "quads" as a candidate; noted, not blocking).
  Landed `TEMPLATE_PATTERNS.cardio = ['conditioning']` (back to a plain `Record<Focus,
  Pattern[]>`) and the "no record may list cardio in primary/secondary" rule.
  **Correction to increment 1's rule:** the "pattern conditioning ⇔ focus cardio" equivalence
  from increment 1 turned out to be too strict once real data landed — the cooldown-stretch/
  warmup tagging above needs a non-conditioning record to carry `cardio` as an extra
  pool-membership focus. Narrowed to one direction only: `pattern === 'conditioning' ->
  focus includes 'cardio'` (a real conditioning exercise must be findable via the cardio focus).
  The converse never held for stretches/warmups and doesn't need to — warmup/cooldown selection
  is role+focus only, never pattern-scoped, and a cardio template slot only ever asks for pattern
  `conditioning`, so a stretch carrying an extra `cardio` tag can never leak into cardio MAIN
  work. The "extra focus needs a warmup/cooldown role" rule (added in increment 1) still holds
  and is what actually gates this. `npm run check` green; golden snapshot
  (`abs, 30min, normal — never all-flexion, seed 5`) updated with `-u` after confirming the diff
  is exactly the expected cascade: `bw-mountain-climber` left the abs `flexion` pool (now
  `conditioning`), `bw-bicycle-crunch` fills that slot instead, and downstream RNG draws for
  warmup/cooldown shift accordingly (nothing structurally wrong, same as the plan predicted).
  Checked app/store for hardcoded `'cardio'`-as-muscle handling: found none — the dashboard's
  muscle balance (`app/src/lib/dashboard.ts` `buildMuscleBalanceRows` /
  `packages/store/src/repositories/stats.ts` `hardSetsByMuscle14d`) is entirely data-driven off
  whatever muscle strings appear in `primary`/`secondary` at logging time, so removing the
  `cardio` tag fixes it with zero code changes, exactly as the plan predicted.

- [x] Increment 3, step 1/4 — cardio template + finisher removal (7e1ffdd): real `cardioSlots()`
  (3 required `conditioning` slots), `ACCESSORY_PATTERNS_BY_FOCUS.cardio = ['conditioning']`,
  and the full-body finisher slot (plus all `isFinisher` machinery) removed end to end. Golden
  snapshot reviewed and updated — diff is exactly the `notes: undefined` key disappearing
  (finisher's AMRAP was its only producer) plus an RNG-cascade reshuffle of sibling/warmup/
  cooldown picks in the hard/45min full fixture from one fewer slot, same total main count (7)
  before and after. `npm run check` green.

- [x] Increment 3, step 2/4 — main-pool scoping + band-ratio exemption (28f1aa6):
  `pipeline.ts` scopes the pool passed to `selectMain`/`resolveLadderSlot` to conditioning-only
  for cardio and conditioning-excluded otherwise, right after the two `applyHardFilters` calls;
  warmup/cooldown selection and `mainSelection.ts`'s internal `overWorkedMuscles`/
  `recentHardMuscles` calls keep the *unscoped* pool on purpose (new `SelectMainInput.volumePool`
  field, defaulting to `pool` for every pre-existing caller) — a history entry from a
  different-focus session must still resolve by id for volume math, and a cardio move must still
  be eligible to warm up a strength day. Confirmed a behavioral no-op for every pre-existing
  focus (zero golden snapshot change, full existing suite unchanged). `mainSelection.ts` also
  skips the `'band'` aggregate pass when `focus === 'cardio'` (≥50% band ratio exemption).
  Verified with a same-pool-different-focus test that the pass really would have forced ≥50%
  band for a non-cardio focus, so the exemption is proven, not just untriggered by construction.
  `npm run check` green.

- [x] Increment 3, step 3/4 — cardio interval prescription (79eb748):
  `prescription/difficultyTable.ts` gets `CARDIO_INTERVAL_TABLE` (easy 3x30s/30s rest, medium
  3x40s/20s, hard 4x45s/15s); `prescribeAccessory` branches on `isCardioExercise(exercise)` to
  read sets/duration/rest/tempo from it instead of `DIFFICULTY_TABLE`, never from the record's
  own `default_seconds` (authored 30s on every record regardless of difficulty — the table's
  `workSec` is what actually varies). §13.1's cap and the 48h recovery band-drop are computed
  once, before the cardio/strength branch, so both still apply to cardio exactly as before. Band
  cardio still takes its band from the record. Found and fixed a real bug while checking
  `swap.ts`'s `buildSwapReplacementEntry`: it re-derived a swapped-in timed exercise's duration
  from *that exercise's own* `default_seconds`, which for cardio is always 30s regardless of the
  slot's actual difficulty — a medium (40s) or hard (45s) cardio swap would have silently reset
  to the easy interval length. Fixed with a `isCardioExercise` branch reading
  `CARDIO_INTERVAL_TABLE[difficulty].workSec` instead; sets/restSec/tempoSec still carry over
  from the replaced entry unchanged, since a conditioning-pattern entry can only have come from
  an already-cardio-prescribed slot (same-pattern-only swap). Tests: `prescribe.test.ts` (table
  values at all three difficulties, no `repTarget`, band cardio band handling, 48h recovery
  interaction, `setsMultiplier` scaling, confirms `default_seconds` is never read), `swap.test.ts`
  (alternatives are conditioning-only, a swapped-in cardio exercise keeps the interval duration
  for its difficulty rather than its own `default_seconds`, verified at both medium and hard).
  `npm run check` green.

- [x] Increment 3, step 4/4 — cardio exercise-count range + full test sweep + golden (97e1056): `timefit/formulas.ts` adds `cardioMainExerciseCountRange` (≤15→[3,5],
  ≤20→[4,6], ≤30→[6,8], ≤45→[8,11], ≤60→[11,14], ≤90→[12,18], else→[14,18] — tuned against the
  fixture-library tests below, `EXPANSION_HARD_CAP`/`longSessionSetsMultiplier` unchanged).
  `fitSession.ts`'s `fitMainEntries` takes an optional `countRange` param (defaults to the
  general table, so every pre-existing caller is unaffected) so its own sanity check agrees with
  whichever range `expandOptionalSlots` was capped by. `pipeline.ts` computes `mainExerciseCount`
  once (cardio range for `focus === 'cardio'`, general table otherwise) and feeds both call
  sites. Confirmed a no-op for every non-cardio focus (full suite unchanged, no golden diff).

  Tests: `properties.test.ts` — folded `'cardio'` directly into the existing full request sweep
  (`FOCI`) rather than a separate narrower sweep; empirically all 900+ cases pass unmodified
  (including `equipmentPreference: 'band'`, where I'd expected the thin 3-band-exercise real pool
  to break the unconditional "≥1 warmup/≥1 cooldown" assertion — it doesn't, because
  `selectWarmupCooldown`'s existing any-focus fallback finds band warmup/cooldown candidates
  from the rest of the library). Added the pattern invariant (non-cardio MAIN never
  `conditioning`; cardio MAIN always `conditioning`) into the same loop.
  `pipeline.test.ts` — a `buildCardioFixtureLibrary()` helper (real library's 190 non-conditioning
  records + 40 synthetic conditioning ones + one jump-rope-anchored one) backs: cardio at
  15/30/60/120min within ±10% or a named 'under' deviation; back-to-back cardio sessions
  (2 prior sessions, `BLOCKED` in effect) still fill under bodyweight-only + `knee_impact` +
  easy; jump-rope never appears in any role across 25 seeds without the anchor, and does appear
  once it's available. Also added the `full`/hard/45min-no-finisher regression test (no `AMRAP`
  note anywhere, main count still capped) as a named test, not just a golden pin.
  `swap.test.ts` — a jump-rope alternative is excluded/offered by `alternativesForSlot` exactly
  like generation is.
  Golden: added a new `cardio, 30min, normal, seed 6` case against the *real* (10-exercise)
  library — no existing snapshot changed (`-u` only wrote the one new entry). Real-library
  result: 6 main entries (all of the library's easy/medium-eligible conditioning exercises — the
  4 hard ones are excluded by a `medium` request), `estimatedMinutes: 32` against a 30min target,
  `timeBudgetDeviation: undefined` — no deviation reported today, even with the pre-increment-4
  pool.
  `npm run validate:library`: 0 errors. `npm run check` green (repo-wide).

- [x] Increment 4, batch 1/4 — low-impact bodyweight cardio (d6883a5): 9 easy, no-knee_impact
  bodyweight records (march in place, step jack, standing knee drive, shadow boxing, low-impact
  skater step, boxer shuffle, standing cross-body knee march, standing mountain climber, fast
  overhead punches). March-in-place/step-jack also carry the warmup role. Golden `cardio, 30min,
  normal, seed 6` updated — diff is a boxer-shuffle-for-jumping-jack main swap, a cooldown draw
  change, and the warmup no longer falling back to a strength squat, all explained by the larger
  real pool. `npm run validate:library` 0 errors; `npm run check` green for packages/data and
  packages/engine (root eslint separately reports 2 pre-existing errors from the parallel agent's
  `.claude/worktrees/...` copy of `functions/lib/index.js` — untouched, out of scope, absent when
  linting packages/data or packages/engine directly).

- [x] Increment 4, batch 2/4 — impact bodyweight cardio (d55c531): 12 medium/hard
  records — tuck jump, star jump, lateral hop, jumping lunge (Split Jump), pop squat, frog jump,
  sprint in place, plank jack (wrist_extension/core_pressure, no knee_impact), seal jack, cross
  jack, butt kick, fast feet. All `bw-`, pattern conditioning, focus ['cardio'], roles ['main'].
  Golden `cardio, 30min, normal, seed 6` updated again — main pool draw shifts to
  bw-butt-kick/bw-mountain-climber/bw-cross-jack/bw-lateral-hop/bw-high-knees/bw-skater-jump (still
  6 entries, all medium, `estimatedMinutes` 32→31, no deviation), warmup/cooldown picks cascade
  with it (bw-step-jack, bw-squat/wu fallback, cd-hip-flexor) — all traced to the larger real pool,
  nothing structural. `npm run validate:library` 0 errors; `npm run check` green for
  packages/data/packages/engine (same pre-existing, out-of-scope `.claude/worktrees/...` eslint
  noise as batch 1, unrelated to any file this track touches).

- [x] Increment 4, batch 3/4 — band + jump rope cardio (this commit): 5 band records
  (`banded-` prefix, all eligible under `DEFAULT_ANCHORS_AVAILABLE` since anchor-low/anchor-mid are
  in it and thigh-loop is always-available: banded jumping jack, banded lateral shuffle, banded
  resisted sprint [anchor-low, hard], banded speed punches [anchor-mid, medium, no impact
  contraindication], banded skater) + 6 jump rope records (`rope-` prefix, `anchor: 'jump-rope'`,
  `anchor_class: 'none'`, `equipment: 'bodyweight'`, `band: null`, all carry knee_impact + ankle:
  basic bounce [easy], alternate-foot step, boxer skip, side-to-side hops [medium], high-knee rope,
  double-unders [hard, + knee_flexion_loaded]). Golden `cardio, 30min, normal, seed 6` updated
  again: `banded-speed-punches` now wins a main slot (band cardio is eligible by default and no
  band-ratio pass applies to cardio — increment 3's exemption, confirmed still working), a 6th main
  slot fills at `sets: 1` (existing `fitMainEntries`/expansion fill-precision behavior, unmodified,
  now visible because the bigger pool gives it a closer-fitting option), rope exercises do NOT
  appear anywhere (no fixture/golden state ticks `jump-rope` in `anchorsAvailable` — expected,
  matches the "unchecked for everyone" decision). `npm run validate:library` 0 errors; `npm run
  check` green for packages/data/packages/engine (same pre-existing worktree eslint noise).

- [x] Increment 4, batch 4/4 — coverage validator + data tests + explain.ts copy fix (this
  commit): `validate.ts` gets (1) a per-record rule that `pattern === 'conditioning'` implies
  `metric === 'time'` (the cardio interval table never reads a rep target — a rep-metric
  conditioning record would silently fall through to the wrong prescription path), (2) the three
  coverage minimums (≥8 easy conditioning, ≥8 without knee_impact, ≥5 band conditioning) as hard
  failures, (3) every `jump-rope`-anchored record must be equipment bodyweight/band null/
  anchor_class none, and (4) a `Cardio (conditioning) coverage` line in the report output (total,
  easy, noKneeImpact, band, jumpRope counts). `index.test.ts` mirrors all of it as jest tests (so
  a plain `jest` run in packages/data catches a regression too, not just the CLI script) plus the
  jump-rope equipment/band/anchor_class invariant. `explain/explain.ts` ~line 149: `balancedAgainst
  === 'conditioning'` now gets its own sentence ("Mixed up to keep your heart rate up without
  repeating what you just did.") instead of falling through the generic "Balanced to keep working
  ${label}" template, which read as "keep working cardio work" — every other pattern label is a
  gerund/noun that slots into that frame, conditioning was the one exception. New explain.test.ts
  cases for both the generic pattern-balanced fallback (previously untested) and the cardio one.
  Golden `cardio, 30min, normal, seed 6` updated once more — the explanation line is the only
  diff.

  Final numbers: library conditioning total 42 (10 pre-existing + 32 new across the three
  batches), 11 easy, 16 without knee_impact, 8 band, 6 jump-rope. `npm run validate:library`: 0
  errors. Full-suite check, run piece by piece since root `eslint .` currently fails at the
  lint step before reaching test (see below): `npm run typecheck` (all workspaces) green,
  `npm run test --workspaces` green (app 70/419, engine 26/1195, data 1/12, store 25/173,
  functions 9/34, all passed), `npm run check:engine-purity` green. `npx eslint packages/data
  packages/engine` (this track's actual scope): 0 errors, pre-existing unrelated warnings only.
  Root `eslint .` reports 2 real errors, both inside
  `.claude/worktrees/agent-a34e489a1da46cfe0/functions/lib/index.js` — a full nested copy of the
  repo that the parallel increment-5 agent's `isolation: "worktree"` run created *inside* the main
  tree (normally a worktree is a sibling directory; this one landed under `.claude/worktrees/` in
  this tree, so root eslint's `functions/lib/**` ignore pattern doesn't match the nested path and
  scans that copy's build output). Present since before batch 1 of this increment, unrelated to
  and unmodified by any of this track's commits — not something increment 4's scope (packages/data
  + engine golden/tests + the one explain.ts fix) can or should fix; flagging for whoever merges
  the worktree branch / cleans it up.

  Sample real-library sessions (throwaway script, not committed) confirmed: cardio 30/60min
  medium, cardio easy and cardio + knee_impact all compliant; legs/full 45min had no
  conditioning in main and no rope anywhere; rope moves appear once `jump-rope` is ticked.

- [x] Increment 5 — app, built in a worktree branch and merged (d6e9049; commits ff97025,
  ffa5523, 5aa061d): Generate gets the Cardio focus option (last) and a "Cardio gear" group with
  Jump rope, unticked by default; Home gets a "Cardio workout" day marker (letter `C`); Quick
  Session's `ALL_FOCI` includes cardio; Approval's Add-exercise MAIN candidates are scoped to the
  session's focus via `scopeMainCandidatesToFocus` (mirrors the pipeline; warmup/cooldown
  untouched). Verified without changes: swap goes through the engine's same-pattern
  `alternativesForSlot` on both screens; `formatToken` already renders `jump-rope`/`conditioning`
  readably; store focus/marker columns are plain TEXT (no migration). The worktree-lint noise noted
  above went away when the worktree was removed. Not fixed (pre-existing, out of scope):
  `SummaryScreen.tsx` renders the raw focus token for every focus.

- [x] Increment 6 — backlog (interval-circuit cardio format; no quad stretch for cardio
  cool-downs), stale `DEFAULT_ANCHORS_AVAILABLE` comment corrected for the jump-rope exception,
  increment 5's sub-log folded in here.

### In progress
- None. Track 14 is complete; `npm run check` and `npm run validate:library` green on master.

### Next
- Device verification owed: generate a Cardio session in the dev client with Jump rope unticked
  and ticked; confirm Legs/Full main work carries no cardio; calendar shows `C`.

### Decisions / gotchas (made with the user — do not re-litigate)
- Cardio sessions = timed straight sets (metric 'time'), no new workout-screen mode.
- Classification is `pattern: 'conditioning'` + `focus` includes `'cardio'`; `isCardioExercise(e)`
  = `e.pattern === 'conditioning'`. The `'cardio'` pseudo-muscle is removed from primary/secondary
  on ALL records (it would otherwise become OVER-WORKED and empty the cardio pool).
- Tag audit — these LOSE the cardio tag and stay strength: thruster, clean-and-press,
  deadlift-high-pull, squat-to-chop, lunge-to-chop, band-swing, squat-jump, bear-crawl,
  bw-bear-crawl, bw-crab-walk.
- These MOVE to cardio: bw-burpee, banded-burpee, bw-sprawl, bw-squat-thrust, mountain-climber,
  bw-mountain-climber, bw-jumping-jack, bw-high-knees, bw-skater-jump, sprinter-pull.
- Cardio moves may still appear in strength WARM-UPS (jacks/high knees keep a strength focus
  alongside 'cardio' because they have the warmup role). Exclusion is main work only.
- Jump rope: new Anchor `'jump-rope'`, anchor_class 'none', equipment 'bodyweight'. NOT in
  ALWAYS_AVAILABLE_ANCHORS or DEFAULT_ANCHORS_AVAILABLE — unchecked for everyone.
- Full-body finisher slot is dropped (and the isFinisher machinery removed).
- Quick Session rotation includes cardio.
- Cardio sessions are exempt from the ≥50% band ratio.
- Only jump rope as new gear; no ladder/cones/sliders/open-space.
