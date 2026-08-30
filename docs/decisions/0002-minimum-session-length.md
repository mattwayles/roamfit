# ADR 0002 — A documented minimum target length for the general pipeline

**Status:** Accepted
**Raised by:** independent review of the §5.6 time-fit fix (round 2)

## Context

§5.6's budget formula floors both allocations regardless of how short the target is:

```
warmup_min   = clamp(round(0.12 × T), 3, 8)
cooldown_min = clamp(round(0.10 × T), 3, 7)
```

At `T = 10`, that's `clamp(1.2, 3, 8) = 3` and `clamp(1.0, 3, 7) = 3` — 6 of the 10 requested
minutes are reserved for warmup and cooldown before any main work happens, leaving a 4-minute
main budget. §5.6's own exercise-count sanity table still expects 3-4 main exercises at that
length, and a focus template's *required* pattern slots (e.g. `full`'s 5 required laddered
patterns, or `upper`'s 4) frequently cannot fit in 4 minutes even at the absolute floor of one
set each. The result, before this ADR, was a session that structurally could not land within
§5.6's own ±10% band — not a content-thinness problem (the "genuinely too thin a pool" case the
engine already reports honestly via `timeBudgetDeviation`), but an inconsistency baked into the
formula itself at very short lengths, which no amount of selection or prescription cleverness can
resolve without either dropping a required pattern (against §5.2/§5.6's own rules) or abandoning
the warmup/cooldown floors (against a literal reading of §5.6).

§9.5 already carves out exactly this problem for its own ~7-minute case: Quick Session does not
run the general warmup/cooldown-minutes allocation at all — it prescribes exactly one warmup and
one cooldown movement, sized on their own, not against a multi-minute budget. That precedent is
the model for this decision.

## Decision

**The general (non-Quick-Session) pipeline has a documented minimum supported target of 15
minutes.** `generateSession` clamps `request.targetMinutes` up to this floor before it drives
anything — template selection, the time budget, prescription. The returned `SessionPlan.
targetMinutes` reflects the *effective* (clamped) target, since that is what the session was
actually generated to hit; a caller that requested less receives an honest number, not a plan
that claims to target a length the pipeline was never going to hit.

At 15 minutes, `warmupMinutes(15) = 3`, `cooldownMinutes(15) = 3`, leaving a 9-minute main
budget — enough for the compressed templates' 3-4 required slots even before any corrective
trimming, so the inconsistency above does not recur at or above the floor.

Any request below 15 minutes is a request for something shorter than the general pipeline can
promise cleanly. §9.5 Quick Session (fixed at ~7 minutes, its own minimal template, its own
warmup/cooldown sizing) remains the correct product answer for "I only have a few minutes" — it
does not go through this clamp because it does not go through the general warmup/cooldown-minutes
allocation this ADR is about.

## Consequences

- `timefit/formulas.ts` exports `MINIMUM_SUPPORTED_TARGET_MINUTES = 15`.
- `pipeline.ts`'s `generateSession` applies `Math.max(request.targetMinutes, MINIMUM_SUPPORTED_TARGET_MINUTES)`
  for the non-Quick path only, and carries the clamped value through as `targetMinutes` on the
  returned `SessionPlan`.
- When a request is clamped, the §5.8 explanation line says so plainly (never a silent
  substitution — the same standard as a PATTERN GAP or a `timeBudgetDeviation`).
- Property/golden tests exercising short targets use 15 minutes as the floor of their sweep;
  a below-floor request is tested separately as its own case (asserting the clamp and the
  explanation note), not swept alongside the general ±10% band tests.
- This is a deviation from a literal reading of §5.6 (which states the formula with no minimum),
  recorded here per CLAUDE.md's rule that any such deviation needs an ADR rather than a silent
  choice. Wave 4/5 (UI) should not offer a sub-15-minute picker option for a full session — only
  Quick Session's fixed ~7-minute button is the supported "I have very little time" affordance.
