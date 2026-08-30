# ADR 0001 — Does BLOCKED / novelty scope apply to warmup and cooldown pools?

**Status:** Accepted
**Raised by:** ORCHESTRATION.md carried-forward issue #3 (Wave 1B → Wave 2)

## Context

§5.2's variety rules (ported verbatim from the `daily-workout` prototype) define, for the
prototype's general exercise pool:

- BLOCKED — used within the last `HARD_COOLDOWN_SESSIONS` (2) sessions. Hard "do not use."
- SOFT COOLDOWN — used 3–5 sessions ago. Usable only to fill an otherwise-uncoverable slot.
- PREFERRED — not used in the last 5 sessions. ≥70% of main work must come from here.
- Novelty — never-performed exercises get priority when one fits a slot.

The prototype applies these uniformly to the exercise it is planning, without a `role` field —
its pool has no warmup/cooldown role distinction to begin with. RoamFit's bundled library does
distinguish `role: warmup | main | cooldown`, and Wave 1B's content pass came in with:

- 9 warmup records (only 4 tagged `abs`)
- 12 cooldown records (only 4 tagged `abs`)

Applying `HARD_COOLDOWN_SESSIONS = 2` / `SOFT_COOLDOWN_SESSIONS = 5` to these pools directly
would frequently leave **zero** eligible warmup or cooldown for a given focus: an `abs` session
run twice in the last 5 sessions would blow through all 4 abs-tagged warmups and all 4 abs-tagged
cooldowns, and every session — §5.1 step 2 — requires both. The pipeline has no fallback
"synthesize a warmup" step and is not meant to grow one; a warmup/cooldown pick repeating sooner
than a main exercise is a materially different kind of repetition to the user (a 45-second
stretch or ramp-up, not the workout's namable content) and does not carry the same "the app is
lazy" signal that reusing a main lift twice in a row does.

## Decision

**BLOCKED, SOFT COOLDOWN, PREFERRED, and the novelty-priority rule apply to `role: main` only.**

Warmup and cooldown selection uses **light rotation** instead:

- Exclude only the exercise used as warmup (resp. cooldown) in the **immediately preceding**
  session for this focus, if an alternative exists in the role+focus-tagged pool. This is a single
  `sessions_ago <= 1` exclusion, not the 2-session hard block or the 5-session soft window.
- If excluding the most-recent pick would leave zero eligible warmup/cooldown candidates for the
  session's patterns (i.e., the pool is that thin), the exclusion is dropped and the same
  warmup/cooldown may repeat. This is allowed to happen silently for warmup/cooldown — it is not
  a PATTERN GAP and does not get an explanation-line callout, because it is not a main-work
  training decision.
- Enjoyment-based avoidance (≤2 rating) and the REPEATEDLY-SKIPPED 30-day suppression still apply
  to warmup/cooldown, since both are per-exercise-state facts independent of pool size, and a
  warmup that's actually painful or actively disliked should still not resurface for 30 days —
  but the suppression is *not* a source of PATTERN GAP messaging for warmup/cooldown as it is for
  main.

## Consequences

- `packages/engine/src/selection/` implements two distinct candidate-filtering paths: the full
  §5.2 rule set for `role: main`, and light rotation for `role: warmup | cooldown`. They share the
  enjoyment-avoidance and REPEATEDLY-SKIPPED primitives but not the BLOCKED/PREFERRED windowing.
- Golden and property tests must exercise a synthetic user who has trained `abs` in 4+ of their
  last 5 sessions to prove the engine still returns a valid warmup and cooldown rather than
  failing pool exhaustion.
- If the warmup/cooldown pool is later topped up (carried-forward issue #3's "consider a content
  top-up"), the light-rotation window can be widened without an engine code change — it is a
  constant, not structural.
