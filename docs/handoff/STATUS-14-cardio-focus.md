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

### In progress
- Increment 3, step 3/4: prescription — add `CARDIO_INTERVAL_TABLE` to
  `prescription/difficultyTable.ts` (easy 3x30s/30s rest, medium 3x40s/20s, hard 4x45s/15s) and
  use it in `prescribeAccessory` when `isCardioExercise(exercise)`: durationSec from the table
  (not `default_seconds`), restSec from the table, `tempoSec: 0`, sets scaled by
  `setsMultiplier` as usual; band cardio still reads its band from the record; §13.1's cap and
  the 48h recovery band-drop still apply, applied before the cardio-vs-strength branch since
  both act on `difficulty`/`band` the same way regardless of table. `swap.ts`'s
  `buildSwapReplacementEntry` — check whether a swapped-in cardio exercise needs its own branch
  or whether reusing `prescribeAccessory`-shaped logic already covers it (currently it does its
  own re-prescription inline, matching the *replaced* entry's shape rather than a fresh
  difficulty-table lookup, so a cardio-to-cardio swap already inherits the interval numbers from
  the entry being replaced — needs confirming with a test, not assuming). Tests:
  `prescribe.test.ts` (interval table values, band cardio, recovery/hard-cap interaction),
  `swap.test.ts` (cardio swap alternatives are conditioning-only and carry interval-shaped
  prescriptions).

### Next
3. Engine: cardio template, finisher removal, main-pool scoping, band-ratio exemption for cardio,
   cardio interval prescription, cardio exercise-count range, tests, golden snapshot.
4. Library additions (~30 cardio records) + coverage validator rules.
5. App: Generate focus option + "Cardio gear" (jump rope), heatmap 'C' + day marker, Quick Session
   rotation, Approval add-exercise scoping.
6. Backlog: park "interval-circuit cardio format".

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
