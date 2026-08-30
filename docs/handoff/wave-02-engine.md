# Wave 2 — The generation engine

**Track id:** `2-engine` · **Status file:** `docs/handoff/STATUS-2-engine.md`
**Spec sections to read:** §5 (all of 5.1–5.8), §6.1–§6.7, §9.4, §9.5, §13.1, §13.2. Also
`~/.claude/skills/daily-workout/SKILL.md` sections "Programming rules" through "Band selection" —
§5.2 is described as *ported verbatim* from it, so the prototype text is authoritative on detail
the spec compresses. Do not read the whole spec.

This wave builds the product. §1.1: *"The deterministic engine is the product."* Everything else
in the app is a surface over what lands here.

## Goal

`packages/engine/` — a pure TypeScript implementation of the §5.1 pipeline and the §6 progression
rules. **No I/O, no network, no React Native, no clock reads outside an injected time source.**
The engine is a function from (library, user state, request) to a session plan.

## Hard architectural constraints

- **Deterministic.** Same inputs → same output, always. Inject any randomness as a seeded RNG
  passed in by the caller. A non-reproducible engine cannot be golden-tested and cannot honor
  `Session.engine_version` (§4.6).
- **Inject the clock.** Never call `Date.now()` inside the engine. Callers pass the current
  `local_date` and timezone (§12). Calendar math uses `local_date` — invariant 6 in `CLAUDE.md`.
- **Sub-50ms** for a full generation over the 200-record library. Add a benchmark test.
- **Zero dependencies** beyond `packages/data`. The purity check from Wave 1A must stay green.

## The pipeline (§5.1)

Implement as seven discrete, individually testable stages, in order:

1. **Hard filters** — equipment, anchors, injuries. Never negotiable, and they run *first*, before
   anything else sees the pool (§13.2). Includes the §13.1 rule that `anchor_class:
   bodyweight_bearing` exercises are hard-capped at `normal` effort regardless of the day's chosen
   effort — no AMRAP, 2+ reps in reserve. That is a code filter, not a suggestion.
2. **Template** — fill the §5.5 focus template's pattern slots in priority order. Upper keeps push
   and pull counts equal. Abs is never all-flexion and rotates which pattern leads.
3. **Selection** — the §5.2 rules. See below; this is the densest part of the wave.
4. **Progression** — for each slot, the variant at the user's current level (§6).
5. **Prescription** — sets, reps or seconds, band, tempo, rest from the §5.4 effort table.
6. **Time fit** — the §5.6 budget formula; add or drop until within ±10% of target. §1.1:
   *"Promise the time and keep it."* Honor the §5.6 exercise-count sanity check.
7. **Explain** — the §5.8 line, as a deterministic template string. **Required, not optional.**
   It must name what was balanced and what changed. When the engine acts on repeated feedback it
   must say so rather than silently reprinting a prescription just called too easy.

## §5.2 selection rules — implement every one, test every one

BLOCKED / PREFERRED sets · ≥70% of main work from PREFERRED · ≥1 novelty exercise whenever one
fits a slot · SOFT COOLDOWN only to fill an otherwise-uncoverable slot · OVER-WORKED muscle caps
(>1.5× trailing mean: at most one exercise, never as primary mover) · UNTRAINED/LOW prioritized
into a slot · 48h recovery (band drop, one-exercise cap, no `hard` on the same muscles trained
yesterday) · enjoyment as tie-break with the ≤2 avoidance rule and the ~40% favorites cap ·
REPEATEDLY-SKIPPED 30-day suppression with the one-time user-facing notice · ≥50% of main work on
bands · **PATTERN GAP is never silent** — a bodyweight-only upper or full session has no pulling,
and the engine must either use a band for that slot or state plainly that the session is
deliberately push-dominant.

That last one is a correctness requirement with a user-visible output. Test it explicitly.

**Open question to resolve and record in an ADR:** does BLOCKED apply to warmup and cooldown
pools? The Wave 1 library has 9 warmups and 12 cooldowns (only 4 of each tagged `abs`), so
applying the recency block to them will exhaust the pool. Recommended: apply BLOCKED and novelty
to **main work only**, with light rotation for warmup/cooldown. Write
`docs/decisions/0001-blocked-scope.md`.

## §6 progression

- Micro-progression order, distinct for band vs bodyweight (§6.2). Applied *fully* before a level
  ever changes.
- Advance / regress / drop-a-level rules (§6.3), including timed work using held-seconds.
- **Cold-start calibration** (§6.5): every family starts at ~30th percentile; first three sessions
  advance or drop a *full level* on `too_easy` / >25% over target / missing the bottom.
- **Mastery** (§6.7): at max level, micro-progression keeps ratcheting; a would-be level change
  becomes a best-set PR check. Never a dead end.
- **Comeback** (§9.4): ≥7-day gap auto-regresses one micro-step per family and cuts volume ~20%;
  ≥21 days returns to calibration. Recovery Week (§9.9) reuses the 7-day treatment exactly — same
  code path, not a parallel one.
- `level_id` is a stable id, never an index — invariant 5.

## Quick Session (§9.5)

**The same pipeline with a minimal template and a ~7-minute budget** — 1 warmup, 3 main,
1 cooldown, effort `normal`. Explicitly *not* a separate code path. The spec calls this out
because it is the one control a motivated user may tap daily, and a hand-rolled shortcut would
silently skip the hard filters and re-hammer the same pattern. If your implementation branches
away from the shared pipeline, it is wrong.

## Testing — this is the deliverable, not an add-on

- **Unit tests per §5.2 rule and per §6.3 rule**, each named for the rule it pins.
- **Golden tests**: fixed seed + fixed user state → committed expected session JSON. These are
  what let later waves refactor without silently changing behavior.
- **Property tests** for the invariants that must hold for *every* generated session: never
  contains a contraindicated exercise; never contains a disabled anchor; never exceeds ±10% of the
  target time; never exceeds the effort cap on a bodyweight-bearing anchor; always has a warmup
  and a cooldown; push/pull balance on upper.
- **Simulation test**: run 30 consecutive sessions for a synthetic user and assert the trajectory
  is sane — levels rise, variety holds, no pattern is starved, no muscle group is chronically
  over-worked. This catches the class of bug unit tests structurally cannot.

## Done criteria

- [ ] All seven pipeline stages implemented and independently tested.
- [ ] Every §5.2 rule and §6.3 rule has a named test pinning it.
- [ ] Golden tests committed and green; generation is byte-identical across runs.
- [ ] Property tests green; the 30-session simulation produces a sane trajectory.
- [ ] Benchmark shows <50ms for a full generation.
- [ ] Purity check green — no RN, no I/O, no ambient clock.
- [ ] `docs/decisions/0001-blocked-scope.md` written.
- [ ] Anything where the spec was ambiguous is recorded in the status file, not silently decided.
