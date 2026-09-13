## Track: 14 — Cardio focus
Last updated: 2026-09-13

Full approved plan (design, library targets, verification): copied below under "Plan". Work is
orchestrated by a lead agent delegating increments to sub-agents.

### Done
- [x] Step 0 — pending Quick Session work committed (9db6d3a)

### In progress
- Increments 1+2 (schema/validator/enums + library tag audit) — delegated

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
