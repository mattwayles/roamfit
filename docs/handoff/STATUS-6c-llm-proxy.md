## Track: 6c-llm-proxy — LLM proxy (§7.3)
Last updated: 2026-09-01 — **track complete for its committed scope; see "What remains unverified"**

### Done
- [x] Ramp-up: ORCHESTRATION.md, wave-06-network.md §3, spec §5.8/§7/§11.3, `claude-api` skill
      invoked before writing any model-facing code.
- [x] `packages/engine/src/llm/validate.ts` — pure "validate anyway" module (§7.3), three
      validators (`validateIntakeOutput`, `validateCoachVoiceOutput`, `validateDistillationOutput`),
      exported from the package. NL intake's schema has no exercise/set/rep/band field at all —
      invariant 2 enforced structurally. 21 tests, `packages/engine/src/llm/validate.test.ts`.
      Commit `821e531`.
- [x] `functions/` — new `@roamfit/functions` workspace, the actual Cloud Function proxy.
      Three jobs (`src/jobs/{intake,coachVoice,distill}.ts`), each: structured output via
      `zodOutputFormat` (schema-valid by construction), validated again via `@roamfit/engine`,
      one repair attempt, deterministic fallback on second failure. Model tiering
      (`claude-opus-5` intake, `claude-haiku-4-5` coach voice + distillation) confirmed against
      the `claude-api` skill's live model table, pinned by `src/models.test.ts` with a comment
      warning not to "fix" the test by updating the literal. `ANTHROPIC_API_KEY` read only in
      `src/config.ts` from the runtime environment. Every job takes an injectable `ParseFn` seam
      (`src/client.ts`) instead of a concrete Anthropic client, so all 23 tests run with zero
      network access. 23 tests across 6 suites. Commit `49a77e8`.
- [x] `packages/store` — the §11.3 queue side:
      - Migration `0005_llm_queue_backoff.sql` adds `deferred_work.next_attempt_at` (nullable —
        NULL means eligible immediately).
      - `schema.ts`: added `llm_coach_voice` to `deferred_work.kind` and `llm_distillation_result`
        to `signal_events.type` — both are plain TS-level `text(..., {enum})` with **no SQL CHECK
        constraint** (confirmed again by grepping `migrations/data.ts` for `CHECK` — none), so
        these were pure code additions needing no migration.
      - `repositories/queues.ts`: `getEligibleDeferredWork` (backoff-aware read),
        `markDeferredWorkDone`, `recordDeferredWorkFailure` (exponential backoff: `2^attempts`
        minutes, capped, permanent `failed` at `maxAttempts`, defaults 6 attempts / 240min cap).
        7 tests in `queues.test.ts`, including the boundary-second eligibility checks and the
        "never throws even for a missing id" guarantee.
      - `repositories/sessions.ts`: `createPendingSession` now also enqueues `llm_coach_voice`
        (payload `{}` — the worker reads the session directly); new `applyCoachVoiceResult`
        setter (updates `explanation` + flips `generatedBy: 'engine+llm'`).
      - `llmQueueWorker.ts` (new, exported from the package root): `processLlmQueue(db, now,
        caller)` drains eligible `llm_coach_voice`/`llm_distillation` jobs via an injected
        `LlmProxyCaller` interface — `packages/store` never imports `@roamfit/functions` or any
        HTTP client; `app/` is expected to implement `LlmProxyCaller` against the deployed Cloud
        Function. A caller throw (network failure) is the only thing that triggers backoff — a
        Cloud Function response that *itself* used its internal deterministic fallback is still
        a normal, successful queue outcome. 6 tests, including the "network failure leaves the
        job pending for retry, never throws further" test and the "discarded session is a
        terminal no-op, not a retry-forever" test.
      - Full `npm run check` green at every commit boundary (897 engine + 58 store + 77 app + 14
        data + 23 functions tests, typecheck, lint, `check:engine-purity`).

### In progress
Nothing mid-flight — this is a clean stopping point. What's left is out-of-scope-by-decision (see
below), not incomplete work.

### Next (deliberately not done in this track — see "Deliberate cuts")
- `app/`-side wiring: an `LlmProxyCaller` implementation that actually calls the deployed Cloud
  Function (fetch/HTTP), a connectivity-restored or app-foreground trigger to call
  `processLlmQueue`, and a natural-language intake text-entry UI. None of this exists yet.
- Deploying `functions/` to a real Firebase project — no `firebase.json` exists in this repo yet
  (that's 6d's scope: Firestore sync setup). `functions/src/index.ts`'s `onCall` wrapper is
  written but has never run against the emulator or a real project.
- 6d (`sync-health`)/6e (`video-cli`) are untouched, as instructed.

### Decisions / gotchas
- **Zod version pinning was the single biggest time sink.** `@anthropic-ai/sdk`'s
  `zodOutputFormat` helper is built against zod's `zod/v4` core surface. This monorepo's root
  hoists `zod@3.25.76` (via `expo`'s own dependency chain), so `functions`'s own `zod` dependency
  must be pinned to the **same** `3.25.76` (not a newer 4.x) to get one physical zod install —
  otherwise TypeScript sees two structurally-similar-but-nominally-distinct `ZodType` generics and
  every `zodOutputFormat(schema)` call fails to typecheck. The fix that actually worked: pin
  `zod: "3.25.76"` in `functions/package.json` (matching the hoisted version) AND import from the
  `zod/v4` subpath (`import { z } from 'zod/v4'`) in `schemas.ts`, not bare `zod` (which is the v3
  classic API in this package version). If a future zod/SDK upgrade reintroduces this, re-check
  `npm ls zod` for a duplicate/invalid nested copy first.
- **NL intake's structured-output schema has no exercise/set/rep/band field.** This was a
  deliberate design choice once I confirmed `GenerationRequest` (packages/engine/src/types.ts) is
  exactly `{focus, effort, targetMinutes, equipmentPreference?}` — no `anchorsAvailable`/
  `limitations` on it either (those are separate sticky user-profile state the hard-filter stage
  applies). This means invariant 2 ("the LLM never selects exercises") is enforced by the type
  the LLM is asked to produce, not merely by validating its content after the fact.
- **`Limitation.source: 'pain_report'`** (packages/engine/src/types.ts) already existed and is the
  right value once a user *confirms* an intake- or distillation-suggested limitation tag — this
  track never writes to the `limitations` table itself (no confirmation UI exists yet), it only
  ever returns/logs the suggestion as data.
- New dependencies (added only to the new `functions` workspace, never to `app/` or
  `packages/*`): `@anthropic-ai/sdk@0.122.0`, `zod@3.25.76`, `firebase-functions@7.3.2`.

### What I verified, and how
- **Invalid model output falls back deterministically — proven, not asserted.** Every job has a
  test where the (mocked) model returns something schema-shaped-but-semantically-wrong twice in a
  row (out-of-range `targetMinutes`, an exercise id not in the session, a fabricated limitation
  tag), and the test asserts exactly 2 calls happened (1 repair) and the result is the documented
  fallback (`null` for intake, the original deterministic string for coach voice, empty signals
  for distillation). I did not do strict red-green TDD turn-by-turn, but the equivalent check:
  I manually traced each test against the code with the corresponding `validateXOutput` call
  commented out mentally, confirmed each would then pass an invalid response straight through
  (e.g. `targetMinutes: 500` reaching `result.params`), which is exactly the regression these
  tests are built to catch. The store-level `queues.test.ts`'s `maxAttempts` test and
  `llmQueueWorker.test.ts`'s "network failure ≠ crash" test are the same shape one layer up.
- **No key material anywhere** — `grep -rIn "sk-ant" .` and a check for
  `ANTHROPIC_API_KEY\s*=\s*['"]` literal assignments across the repo (excluding node_modules/.git)
  both return nothing. `getApiKeyOrThrow` is the only read site and only reads from an injectable
  env object (defaulting to `process.env`), tested with a fixture string clearly not a real key.
- **The offline path is untouched.** I did not modify `packages/engine`'s generation pipeline, any
  approval/active/summary screen, or any lifecycle transition in `sessions.ts`/`completion.ts`
  beyond adding one `enqueueDeferredWork` call (fire-and-forget, synchronous, no `await`, no
  network) inside `createPendingSession`. The full pre-existing store and app test suites
  (58 + 77 tests, all pre-existing plus my additions) pass unmodified in behavior.
- **Prompt caching: NOT verified against a live API — I do not have a deployed function or a real
  API key in this environment, and I'm saying so plainly rather than asserting it works.** What I
  built instead is the structural argument the brief calls a legitimate substitute:
  `functions/src/prompt.ts`'s `buildStableSystemBlock` puts the `cache_control: {type:
  'ephemeral'}` breakpoint on the first (and only) system block, and every job's request
  construction puts all per-user/volatile content (the untrusted freeform text) strictly after
  that block, in `messages`, never interpolated into the system text. `intake.test.ts`'s
  "keeps the system block byte-identical across different freeform inputs" test and
  `distill.test.ts`'s "passes the untrusted retrospective as message data, never inside the
  stable system block" test pin exactly this — they would fail if a future change ever
  interpolated per-request text into the cached prefix. I have never observed a real
  `cache_read_input_tokens` value; if verifying that against a live deployment is wanted next,
  it requires an actual `ANTHROPIC_API_KEY` and a couple of real calls against the deployed
  function.

### Carried-forward issues (for the orchestrator to file)
1. **No app-side wiring for any of this yet.** `functions/` and the store-side queue/worker exist
   and are fully unit-tested, but nothing in `app/` calls the deployed function, implements
   `LlmProxyCaller`, or triggers `processLlmQueue`. There is also no NL-intake text-entry screen.
   This is a deliberate scope cut (the brief's scope is "the proxy," not new app UI) but it means
   the feature is inert until a UI track picks it up.
2. **`functions/` has never been deployed or run against a Firebase emulator.** No `firebase.json`
   exists in this repo (6d's scope). `src/index.ts`'s `onCall` wrapper is untested beyond
   typechecking.
3. **Prompt caching's actual cache-hit behavior is unverified against a live API**, for the reason
   stated above — needs a real key and a deployment to close out.
