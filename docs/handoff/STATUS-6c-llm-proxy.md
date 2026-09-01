## Track: 6c-llm-proxy — LLM proxy (§7.3)
Last updated: 2026-09-01

### Done
- [x] Ramp-up: read ORCHESTRATION.md, wave-06-network.md §3, spec §5.8/§7/§11.3, `claude-api` skill.
      Confirmed model ids against the skill (not memory): `claude-opus-5` for intake,
      `claude-haiku-4-5` for coach voice + distillation — matches spec §7.3 verbatim, so no ADR
      needed for tiering.
- [x] `packages/engine/src/llm/validate.ts` — pure "validate anyway" module, three validators:
      `validateIntakeOutput`, `validateCoachVoiceOutput`, `validateDistillationOutput`. Exported
      from `packages/engine/src/index.ts`. Key design call: NL intake's structured-output schema
      (`IntakeLlmOutput`) has no exercise/set/rep/band field at all — invariant 2 ("the LLM never
      selects exercises") is enforced by the shape, not just by checking values — plus a
      belt-and-suspenders check that rejects a response if a selection field is smuggled in
      anyway. Coach voice / distillation validate any referenced exercise id against the
      session's own entries (not the full library) and any suggested limitation tag against the
      real `Contraindication` vocabulary.
      21 tests in `validate.test.ts`, all written to fail without the check they prove (e.g. the
      "smuggled exerciseId" test, the "exercise not in this session" containment test — these are
      the prompt-injection-resistance proof: even if retrospective text steers the model into
      naming an exercise the user never did, the validator rejects it before it reaches any
      signal event).
      `npm run typecheck --workspace packages/engine`, `check:engine-purity`, and the full engine
      suite (897 tests) all green.
      Commit: (pending — see below)

### In progress
- Building `functions/` — a new top-level package for the actual Cloud Function proxy (Node/TS,
  `@anthropic-ai/sdk`, no key in repo). Next concrete steps:
  1. `functions/package.json` (own workspace member), `tsconfig.json`, jest config.
  2. `functions/src/models.ts` — tiering constants (`claude-opus-5` intake, `claude-haiku-4-5`
     coach voice + distillation), sourced from the ids confirmed against the `claude-api` skill
     above — comment citing that, never a bare recalled literal.
  3. `functions/src/config.ts` — reads `ANTHROPIC_API_KEY` from Cloud Functions runtime config /
     env only; throws a clear error if unset; nothing resembling a key literal anywhere in the
     file or in test fixtures (tests inject a fake `AnthropicLike` client, never a real SDK
     instance with a key).
  4. `functions/src/prompt.ts` — prefix structure: system block (library + rules) first behind a
     `cache_control: {type:'ephemeral'}` breakpoint, per-user volatile data last; retrospective /
     pinned-note text wrapped in an explicit `<untrusted_user_text>` delimiter with an instruction
     that it is data, never an instruction.
  5. `functions/src/jobs/{intake,coachVoice,distill}.ts` — each: build request (strict tool /
     `output_config.format`), call the injected Anthropic-like client, parse, validate via
     `@roamfit/engine`'s new validators, one repair attempt on invalid, deterministic fallback on
     second failure (coach voice's deterministic fallback is literally `composeExplanation`'s
     existing output — no new template needed).
  6. Tests: mock the Anthropic client to return good/bad/malicious payloads. Must include a test
     that fails if `validateXOutput` is not called (i.e. asserts the invalid-response path
     actually falls back, not just that valid responses pass through).

### Next
- After `functions/` is real and tested: wire the client side.
  - `packages/store`: `schema.ts`'s `deferredWork.kind` enum and `signalEvents.type` enum are
    plain TS-level `text(..., {enum: [...]})` — **no SQL CHECK constraint exists** (verified by
    reading `migrations/data.ts`), so adding `'llm_coach_voice'` to the kind list and a
    distillation-result signal type is a pure code change, no new migration required. Confirm
    this again before relying on it — re-grep `data.ts` for `CHECK` if migrations have changed
    since this was written.
  - A `processLlmQueue` worker in `packages/store` draining `llm_distillation` /
    `llm_coach_voice` from `deferred_work` with exponential backoff (compute next-eligible-retry
    from `attempts` + `created_at`/`processed_at`; cap attempts; on final failure just leave the
    deterministic explanation / skip distillation — must never surface an error to the user).
    Takes an injectable proxy-calling function so it's testable without network.
  - `enqueueDeferredWork(db, 'llm_coach_voice', ...)` call at session generation time
    (`packages/store/src/generation.ts`), payload = session id (+ maybe the deterministic
    explanation for the "no worse than this" floor).
  - A thin `requestNaturalLanguageIntake` client function in `packages/store` (online-only, no
    queue — direct call with a short timeout) returning `GenerationRequest | null`. **Scope
    decision: no new app UI for NL intake text entry in this track** — the brief's scope is "the
    proxy," Wave 4's picker screens already work standalone, and building a new intake screen is
    a UI-track concern. Will flag as a carried-forward issue for the orchestrator to assign,
    matching the pattern of issue #20/#29 (feature built end-to-end at the data/proxy layer, UI
    wiring owed to a later wave).
- Prompt caching: **cannot verify `cache_read_input_tokens` without a deployed function + live
  API key**, which this track does not have. Will state that explicitly rather than claim it
  works — the substitute is a structural test pinning that (a) the system/library block is
  byte-identical across two calls with different per-user data, and (b) it is the first content
  in the request with the `cache_control` breakpoint on it, and per-user data is strictly after.
- Final `npm run check` pass, update this file to final state, report to orchestrator.

### Decisions / gotchas
- `GenerationRequest` (packages/engine/src/types.ts) is narrower than I first assumed — no
  `anchorsAvailable`/`limitations` fields; those are sticky user-profile state applied by the
  hard-filter stage separately. This is *good* for the invariant: NL intake's structured output
  is exactly `{focus, effort, targetMinutes, equipmentPreference?}` plus one optional suggested
  limitation tag that must never be auto-applied — it can't carry an exercise selection even in
  principle, because the field doesn't exist on the type it's constructing.
- `Limitation.source` already has a `'pain_report'` variant (packages/engine/src/types.ts) — will
  reuse that for a confirmed LLM-suggested limitation rather than inventing a new source value.
- No SQL migration needed for new `deferred_work.kind` / `signal_events.type` values (see above) —
  keep re-verifying this assumption before each use, since a future migration could add a real
  CHECK constraint.
- New dependency to add when `functions/` lands: `@anthropic-ai/sdk` (functions workspace only,
  never in `app/` or `packages/*`).
