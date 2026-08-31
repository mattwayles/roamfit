# ADR 0006 — Recovery Week's volume cut stays a store-level post-generation pass

**Status:** Accepted
**Raised by:** carried-forward issue #11 (Wave 3 review), assigned to Wave 5

## Context

§9.9 Recovery Week reuses §9.4's comeback mechanism: auto-regress one micro-step per family and
cut that session's volume ~20%. Wave 3 built the micro-step regression as a genuine engine
transform (`applyComebackToProgressionStates('week', …)`, called on `UserState.progressionStates`
*before* generation, so the engine picks exercises and prescribes sets against the already-eased
state — this part is a real engine decision, consistent with invariant 2).

The volume cut is different. `generateSession`'s own internal comeback detection
(`assessComeback(userState.history, …)`) is what would normally drive the ~20% cut inside
prescription — but it is keyed off an *actual* gap in `history` (days since the last session). A
Recovery Week is, almost by definition, requested by a *consistently training* user with no such
gap: `assessComeback` reads `none` for them, so the engine's own internal cut never fires. Reaching
the same cut for an explicitly-requested Recovery Week would mean either:

1. Faking a gap in the `UserState.history` handed to the engine (lying to a pure function about
   the very history it's supposed to read honestly — directly contradicts §5.1's "pure function of
   real state" framing and would corrupt any other history-driven decision the same generation call
   makes, e.g. pattern-gap notes or OVER-WORKED checks that also read `history`), or
2. Adding a `GenerationRequest` flag (`recoveryWeek: true`) that the engine's prescription step
   reads directly, alongside — not instead of — the real `assessComeback` result.

Option 2 is the correct fix in principle: it says what it means, and it doesn't corrupt `history`
for anything else the pipeline computes in the same call. Wave 3 chose not to make this engine
change and instead applies the identical `COMEBACK_VOLUME_MULTIPLIER` (0.8) as a `Math.floor(sets *
0.8)` pass over the returned `SessionPlan` in `packages/store/src/generation.ts`'s `generate()`,
after `generateSession`/`generateQuickSession` returns. This wave (5) inherited the open question
of whether to promote it into the engine now.

## Decision

**Keep it as the store-level post-generation pass. Do not promote it into the engine in this
wave.** Concretely, this ADR formalizes what was already true in code (`generation.ts`'s
`scaleSessionSets`), rather than changing it.

Reasoning:

- The store-level pass is already **exactly** the same multiplier the engine's own internal
  comeback path uses (`COMEBACK_VOLUME_MULTIPLIER`, re-exported from `@roamfit/engine` and
  imported verbatim in `generation.ts` — not a re-derived or guessed constant). It is not a
  parallel implementation of the *policy*; it is a parallel *application site* of one shared,
  engine-owned number. That materially narrows the invariant-2 risk: the store never decides
  *how much* to cut, only *whether* this session gets the cut applied, which is itself dictated by
  an explicit user action (the manual toggle or an accepted auto-suggestion) that has to live
  outside the engine's pure `(library, state, request) -> plan` boundary regardless of where the
  multiplier is applied.
- A `GenerationRequest.recoveryWeek` flag would still need the store to *decide* whether to set it
  (from the manual toggle or `shouldSuggestRecoveryWeek`'s stats-driven suggestion, both
  store/UI-layer concerns) — the engine change would move *where* the multiplication happens, not
  *who decides a Recovery Week is happening*. That decision-making genuinely belongs above the
  engine either way.
- The known correctness gap this leaves (documented already in `generation.ts`'s inline comment
  and in `STATUS-3-persistence.md`) is narrow and already-tested: the post-generation `Math.floor`
  pass can round a set count down more aggressively than the engine's own in-prescription cut
  would (e.g., it can't rebalance across a pattern-gap substitution the way prescription logic
  could), and it never touches rest/tempo/band — only `sets`. For a v1 whose Recovery Week week is,
  by design, a single lighter week and not a load-bearing progression mechanism, this is an
  acceptable approximation, not a correctness bug users can hit repeatedly by surprise.
- Promoting this properly (a real `GenerationRequest.recoveryWeek` flag threaded through
  `pipeline.ts`'s prescription step, replacing the post-hoc `scaleSessionSets`) is a genuine engine
  change with its own test surface (prescription tests, template tests, the golden-snapshot suite)
  that this wave's budget is better spent on the actual missing pieces of this wave (the §14
  dashboard, the §9.9 auto-suggest *trigger* itself — see issue #12, closed this wave — and the
  rest of §9/§14's UI surface, which had zero coverage before this wave and is explicitly what the
  brief prioritizes).

## Consequences

- No code change from this ADR alone — it documents and closes the open question left by Wave 3,
  per the brief's instruction to "promote to an ADR either way."
- `packages/store/src/generation.ts`'s `scaleSessionSets` and its surrounding comments remain the
  canonical explanation of the mechanism; this ADR is the canonical explanation of *why* it wasn't
  moved.
- **Future work, if picked up:** add `recoveryWeek?: boolean` to `GenerationRequest`
  (`packages/engine/src/types.ts`), thread it into `pipeline.ts`'s call into `prescription/`
  alongside the existing `assessComeback` result (an explicit request ORs with the auto-detected
  gap, rather than replacing it), and delete `scaleSessionSets` once the engine applies the
  multiplier itself pre-`SessionPlan`. At that point `generation.ts` would stop importing
  `COMEBACK_VOLUME_MULTIPLIER` for this purpose entirely.
- Issue #12 (the missing auto-suggest *trigger*) is a separate, now-closed concern — see
  `packages/store/src/repositories/stats.ts`'s `weeksSinceLastRecoveryWeek` tracking and
  `shouldSuggestRecoveryWeek`, and `STATUS-5-motivation.md`.
