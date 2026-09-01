## Track: 6f-deploy — close #41 (functions build), #34 (app LLM wiring), #36 (caching verification)
Last updated: 2026-09-01 — **track complete for its committed scope; see "What remains open"**

Session note: this run was resumed after an earlier session died mid-increment on a network
error (ENOTFOUND), not a code problem. The orchestrator finished the in-flight piece
(`functions/src/index.test.ts` failing to load under Jest because importing `./index` drags in
`firebase-admin` → `jwks-rsa` → `jose`, an ESM package Jest's CommonJS `require` can't load) and
committed it as `0e458de` — see that commit and the "Issue #36" section below for exactly what
changed. Everything from here down reflects the actual final state, not a plan.

### Done
- [x] Ramp-up: CLAUDE.md, ORCHESTRATION.md (status board + all 42 carried-forward issues +
      verification log), STATUS-6c-llm-proxy.md, STATUS-6d-sync-health.md, spec §7.3/§11.3/§11.6.
      HEAD confirmed `2592e25`, tree clean at start.
- [x] **Issue #41 — `functions/` can now build and the artifact is proven loadable.**
      `functions/package.json`: `main` → `lib/index.js`, `engines.node: "20"`, new `build` script
      (`esbuild src/index.ts --bundle --platform=node --target=node20 --format=cjs
      --outfile=lib/index.js --external:firebase-functions --external:@anthropic-ai/sdk
      --external:zod`). `@roamfit/engine` moved from `dependencies` to `devDependencies` — it is
      a workspace-local package (its own `main` is `src/index.ts`, TypeScript source, never
      published to npm), so it must be *bundled into* `lib/index.js`, not listed as an installable
      npm dependency Cloud Build would try (and fail) to fetch. `firebase-functions`,
      `@anthropic-ai/sdk`, `zod` stay real `dependencies` and stay `--external` so `npm install`
      at deploy time fetches the genuinely-published versions instead of duplicating them into the
      bundle. `firebase.json`: predeploy now runs typecheck then build; `ignore` list drops `src`,
      `*.test.ts`, `**/*.map`, `jest.config.js`, `tsconfig.json` from the deployed zip (none of
      that is needed once `lib/index.js` is self-contained). `.gitignore` gains `functions/lib/`
      (build output, not committed — built fresh by predeploy). `eslint.config.js` ignores
      `functions/lib/**` (the bundle isn't hand-written source, don't lint it). Commit `80040e8`.
      - **Verified the artifact is actually loadable, not just `tsc`-clean**, per the brief's
        explicit warning that a green `tsc` is not proof: `functions/src/build.test.ts` runs the
        real `npm run build` (not a mock), then spawns a **separate plain `node -e` child
        process** (deliberately not Jest's own `require()` — Jest's ESM/CJS interop rules choke
        on an unrelated transitive ESM dependency inside `firebase-functions`'s auth chain,
        which is a Jest artifact, not a real problem in the actual Cloud Functions Node runtime)
        that requires `lib/index.js` and asserts all three exports (`llmIntake`, `llmCoachVoice`,
        `llmDistillFeedback`) are present and shaped like a `firebase-functions` v2 callable
        (`typeof fn === 'function' && typeof fn.run === 'function'`). A third test greps the
        bundle for `validateIntakeOutput` (proves `@roamfit/engine` is really inlined) and asserts
        no `require('@roamfit/engine'|'@roamfit/data')` remains (proves it isn't left as an
        unresolvable external).
      - **Verified by mutation**, per the verification bar: added `--external:@roamfit/engine` to
        the build command and re-ran — 2 of 3 tests fail immediately (the plain-Node require
        throws `Cannot find module '@roamfit/engine'`; the "no @roamfit require left in" check
        also fails), exactly the class of defect the brief warned this project keeps shipping.
        Restored the correct build command, re-ran, all 3 green again.
      - New dependency: `esbuild@0.28.2` (devDependency, `functions/` workspace only).

- [x] **Issue #34 — `app/` wiring for the LLM queue.** `app/src/lib/llmProxyClient.ts`:
      `createLlmProxyCaller()` implements `packages/store`'s `LlmProxyCaller` interface via
      `firebase/functions`' `httpsCallable`, calling the deployed `llmCoachVoice`/
      `llmDistillFeedback` Cloud Functions. Same shape as `firestoreSyncClient.ts` on purpose:
      lazy `require()` of `firebase/app`/`firebase/functions` (never a static top-level import,
      so this file is safe to import under Jest), degrades to `null` whenever the six
      `EXPO_PUBLIC_FIREBASE_*` env vars aren't configured (this environment included — no
      Firebase project, exactly the documented default). `opportunisticSync.ts` now also drains
      `processLlmQueue` inside its own try/catch, third worker alongside the pre-existing device
      queue and Firestore sync — every worker isolated, a null caller skips the call entirely
      rather than even attempting one. No change to `packages/store`'s `LlmQueueWorker`/
      `llmQueueWorker.ts` — only the `app/`-side seam it already documented as missing.
      - **Verified the critical path is untouched**: did not modify any file under
        `app/src/screens/` reachable from generate/approve/run/complete/log, nor
        `packages/store`'s `sessions.ts`/`completion.ts`/`generation.ts`. The only new call site
        is `opportunisticSync.ts`, itself only invoked from `HomeScreen.tsx`'s pre-existing
        `useFocusEffect` (6d's trigger, unchanged).
      - **Verified by mutation**, per the verification bar:
        `app/src/lib/opportunisticSync.test.ts` asserts `runOpportunisticSync` never throws even
        when every worker rejects and every caller-factory throws, and that a `null`
        caller/client means the worker is never even attempted. Removed the `try/catch` around
        the new `processLlmQueue` call — the "never throws" test failed immediately with the
        injected caller-factory error surfacing as an unhandled rejection, exactly the defect
        class the brief named ("does anything... throw when the proxy is unreachable?").
        Restored, re-ran, green. `app/src/lib/llmProxyClient.test.ts` locks in the same
        unconfigured-environment-returns-null contract `firestoreSyncClient.test.ts` already
        proves for its sibling.
      - No new dependencies — `firebase/functions` ships inside the already-installed `firebase`
        package (`app/package.json`, added by 6d).
      - **Honest scope of the critical-path verification (the orchestrator asked me to be
        explicit, not to paper over this):** `app/src/lib/opportunisticSync.test.ts`'s "never
        throws, even when every worker rejects and every caller factory throws" test is the one
        mutation-verified proof that exists — I removed the `try/catch` around the new
        `processLlmQueue` call and confirmed it fails. **No test exercises the actual
        critical-path screens** (`ApprovalScreen.tsx`/`WorkoutScreen.tsx`/`SummaryScreen.tsx`,
        or `generate`/`createPendingSession`/`recordSessionCompletion` in `packages/store`) with
        the LLM proxy unreachable or the key unset. The guarantee those screens are unaffected
        rests on the *structural* fact that none of them import `opportunisticSync.ts`,
        `llmProxyClient.ts`, or `processLlmQueue` at all (confirmed by grep — the only import
        site is `HomeScreen.tsx`'s pre-existing `useFocusEffect`, unchanged by this track) — not
        on a test that would catch a future regression if someone later wired a call into one of
        those screens. Flagging this precisely so the orchestrator can go break it at the level
        that matters (e.g. add a call to `processLlmQueue` inside `ApprovalScreen.tsx` and
        confirm generate/approve still works before this is trusted as fully proven at that
        layer).

- [x] **Issue #36 — `cache_read_input_tokens` is now observable end-to-end; the criterion itself
      stays OPEN pending a live call.** Landed at `0e458de` (orchestrator finished this after the
      session-death interruption; see the note at the top of this file).
      `functions/src/handlers.ts` (new) holds the testable half of each callable —
      `handleIntake`/`handleCoachVoice`/`handleDistillFeedback`, each taking an injected
      `ParseFn` (same seam every `src/jobs/*.ts` already uses) and an injected `LogSink`
      defaulting to `firebaseLogSink` (lazily `require`s `firebase-functions`'s `logger.info`
      only when actually invoked, so importing `handlers.ts` never loads Firebase at all). Every
      call now emits one structured `llm_proxy_call` log line with `cacheReadInputTokens` as its
      own top-level JSON field, plus `job`, `model`, `repaired`, `usedFallback` — readable in
      Cloud Logging with `jsonPayload.cacheReadInputTokens` after a real deploy (see the runbook).
      `functions/src/index.ts` re-exports the handlers and keeps the three thin `onCall`
      wrappers, which still touch a real Anthropic client and stay untestable without a key by
      construction (that's the entire point of `getApiKeyOrThrow`).
      - **Why not test through `index.ts` directly**: importing `./index` pulls in
        `firebase-functions/v2/https` → `firebase-admin` → `jwks-rsa` → `jose` (ESM), which
        Jest's CommonJS `require` cannot load — confirmed this also holds for the
        `firebase-functions/logger` subpath specifically (same transitive chain), which is why
        the log sink is an injected boundary rather than a direct import.
      - **Verified**: `functions/src/handlers.test.ts` (3 tests) asserts the log line fires with
        the real `cacheReadInputTokens` value on a valid first-call response, on the
        repair-then-fallback path (proving logging isn't skipped on fallback), and on a normal
        `distillFeedback` call. **Verified by mutation, both directions**, per the verification
        bar: deleting the `log(...)` call entirely fails all 3 tests; hardcoding
        `cacheReadInputTokens: 0` in the logged fields (instead of passing through
        `result.cacheReadInputTokens`) also fails all 3 tests (they assert specific non-zero
        injected values). Full `npm run check` green after landing (86 app / 897 engine / 14
        data / 93 store / 29 functions / purity OK).
      - **The done-criterion itself is NOT met.** No live Anthropic API key or deployment exists
        in this environment, so `cache_read_input_tokens` has never been observed as an actual
        non-zero value from a real call — only the plumbing that would let an operator observe it
        is now in place. Stated plainly, not asserted as closed.
      - **A real, already-present variance source, found while writing the runbook**:
        `functions/src/jobs/distill.ts` interpolates `input.sessionExerciseIds` directly into its
        system block (`` `${DISTILL_SYSTEM_PROMPT}\n\nThis session's exercise ids: ${...}` ``,
        inside `buildStableSystemBlock`). Every session has a different exercise-id list, so
        `llmDistillFeedback`'s cache can only ever hit across *repeat calls for the same session*
        within the TTL, never across sessions or users — unlike `intake.ts`/`coachVoice.ts`,
        whose system blocks are the literal constant string. Not a safety bug (session exercise
        ids aren't untrusted content, and nothing in `prompt.test.ts`'s existing pins claims
        otherwise), but a real caching-effectiveness gap worth knowing before anyone is surprised
        by `llmDistillFeedback` showing a lower cache-hit rate than the other two jobs in
        production. Documented as the first thing to check in the runbook's "persistent zero"
        section and filed as a carried-forward issue below.
      - New file `docs/RUNBOOK-functions-deploy.md` — the full operator deploy procedure (login →
        project → enable Firestore/Anonymous Auth → `firebase functions:secrets:set
        ANTHROPIC_API_KEY` → build → deploy → post-deploy checks → app-side env vars) plus the
        exact issue #36 verification procedure (what to run, what a healthy value looks like,
        what a persistent zero means and the four most likely causes given this codebase
        specifically, ranked by likelihood).

### In progress
Nothing mid-flight — this is a clean stopping point. All three issues in scope have been
addressed to the extent possible without live credentials.

### Next (for whoever picks this up with real credentials)
- Actually run `docs/RUNBOOK-functions-deploy.md` against a real Firebase project — this is the
  only way to close #36 for real, and the only way to prove #41's Cloud Build step resolves
  correctly against a real Cloud Build environment (verified locally that the artifact loads in
  plain Node; never verified against the actual GCP build/deploy pipeline).
- Consider hoisting `sessionExerciseIds` out of `distill.ts`'s cached system block (into the
  per-request `messages` content instead, same as the untrusted retrospective text already is) if
  cross-session caching on that job turns out to matter — currently only same-session repeat
  calls within the TTL can hit cache for that job. Not done here: touching the prompt shape
  without a live key to verify the change didn't regress anything felt like the wrong tradeoff for
  this track's scope.
- A settings/NL-intake UI screen that actually surfaces `handleIntake`'s output — still doesn't
  exist (this track wired the queue-drain path for coach voice/distillation, not a new intake
  screen; matches 6c's original scope note that "no NL-intake UI" was a deliberate cut).

### Decisions / gotchas
- **Why esbuild, not `tsc` with `module: commonjs`:** the monorepo's workspace packages
  (`@roamfit/engine`, `@roamfit/data`) are never built to JS anywhere in this repo — every
  workspace's `main` points straight at TypeScript `src/index.ts`, and every consumer (Jest via
  ts-jest, Metro via Expo's own TS support) runs the TS source directly. A Cloud Function's Node
  runtime cannot do that. `tsc`-only would still leave `require('@roamfit/engine')` unresolvable
  at deploy time (no `npm`-installable `@roamfit/engine` exists). Bundling with esbuild solves
  both "build step" and "workspace-package-that-isn't-on-npm" in one shot: esbuild resolves the
  workspace symlink via its `main` field and inlines the actual TS source (it transpiles TS
  natively), while real npm dependencies stay `--external` so `npm install` still fetches them
  normally at deploy. This is the standard shape for a Firebase Functions + npm-workspaces
  monorepo without publishing internal packages to a registry.
- **No source maps generated** — the `esbuild` invocation doesn't pass `--sourcemap`, so there is
  nothing to exclude; the `ignore` list's `**/*.map` entry is defense-in-depth for if that ever
  changes.
- **`engines.node: "20"`** produces an `EBADENGINE` npm warning locally (this dev machine runs
  Node 26) — harmless; it only constrains what `npm install` warns about locally, and Cloud
  Functions' own Node 20 runtime is what actually matters at deploy time.
- **Why `handlers.ts` is a separate module from `index.ts`, not just exported functions inside
  it**: this is not a style preference — `index.ts` has to import `firebase-functions/v2/https`
  and `firebase-functions/params` to build the real `onCall` wrappers, and that import chain is
  what drags in the Jest-incompatible `jose` ESM package. Any test that wants to exercise the
  logging/job-invocation logic has to import a module that never touches that chain, which is
  exactly what `handlers.ts` is for. `build.test.ts` (issue #41) sidesteps the same problem a
  different way — spawning a plain `node` child process instead of avoiding the import — because
  it genuinely needs to prove `index.ts`'s `onCall` exports work, not just the logic inside them.

### What I verified, and how
- **Issue #41**: see that section above — build-artifact loadability, proven in a real Node
  process (not Jest), verified by mutation (externalizing `@roamfit/engine` breaks it).
- **Issue #34**: see that section above — `runOpportunisticSync` never throws even when every
  worker/caller-factory fails, verified by mutation. Explicitly **not** verified: the
  critical-path screens themselves under proxy failure (see the honest-scope note in that
  section) — this rests on a structural/grep argument, not a test at that layer.
- **Issue #36**: see that section above — the log line fires with the real (non-hardcoded)
  `cacheReadInputTokens` value on every call including the fallback path, verified by mutation in
  both directions (deleting the log call, and hardcoding the logged value to 0). The live-API
  claim itself (a real non-zero value observed) is explicitly NOT verified — no key, no
  deployment, stated plainly rather than asserted.
- **No credentials, keys, or non-placeholder project ids anywhere in this track's changes** —
  re-grepped `functions/`, `app/src/lib/llmProxyClient.ts`, `docs/RUNBOOK-functions-deploy.md`,
  and `.firebaserc` for `sk-ant`, `apiKey\s*[:=]\s*['"]`, and any string resembling a real GCP
  project id; nothing found beyond the pre-existing `REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID`
  placeholder from 6d and the documented `EXPO_PUBLIC_FIREBASE_*`/`ANTHROPIC_API_KEY`
  environment-variable read sites.
- **No bundled YouTube video id** (invariant 8) — this track touched no media/video code at all.
- **`packages/engine` purity** — untouched by this track; `npm run check:engine-purity` green at
  every commit boundary (it bundles `@roamfit/engine`'s *source* into the Cloud Function via
  esbuild, which is a build-time inclusion in a separate deployable artifact, not an import
  *from* `packages/engine` into `app/` or React Native — the purity check's actual invariant is
  unaffected).
- **No new persistence logic in `app/`** (ADR 0003/issue #13) — `llmProxyClient.ts` only calls
  through `packages/store`'s existing `processLlmQueue`/`LlmProxyCaller` seam; it holds no SQLite
  access of its own.

### Carried-forward issues (for the orchestrator to file)
1. **§7.3/§11.6 airplane-mode-and-real-deploy verification is still entirely unattempted** — same
   class as issues #16/#22/#27/#35 before it. `docs/RUNBOOK-functions-deploy.md` is the first
   complete, exact procedure to actually do it; nobody has run it. Closing #36 for real requires
   running it.
2. **`distill.ts`'s cached system block includes `sessionExerciseIds`**, a per-session-varying
   value, inside what §7.3 calls the stable/cacheable prefix. Not a safety issue (session
   exercise ids are trusted, engine-produced data, not user freeform text — the
   untrusted-text-stays-out-of-the-system-block invariant `distill.test.ts` already pins is
   unaffected), but it means `llmDistillFeedback` can only ever get a cache hit on a *repeat* call
   for the *same session*, never across sessions/users, unlike `intake.ts`/`coachVoice.ts`'s
   fully-constant system prompts. Worth a small follow-up (move `sessionExerciseIds` into the
   per-request `messages` content, same pattern already used for the untrusted retrospective) once
   there's a live deployment to verify the change against — not done in this track since editing
   prompt shape with no way to verify caching behavior felt like the wrong tradeoff.
3. **The critical-path guarantee for issue #34 is proven structurally (grep — nothing under
   `app/src/screens/` or `packages/store`'s session lifecycle imports the new LLM wiring) and at
   the `opportunisticSync.ts` unit level (mutation-tested), but not by a test that would catch a
   future regression if someone later wired `processLlmQueue`/`llmProxyClient` into one of
   `ApprovalScreen.tsx`/`WorkoutScreen.tsx`/`SummaryScreen.tsx` directly.** Flagged explicitly per
   the orchestrator's ask, not glossed over.
4. **No NL-intake text-entry UI still** (carried forward from 6c's own issue list) —
   `handleIntake`/`llmIntake` exist and are now logged/observable, but nothing in `app/` calls
   them; only the coach-voice/distillation queue-drain half of §7.1 is wired to the UI.

### New dependencies (noted per CLAUDE.md)
- `esbuild@0.28.2` — `functions/` workspace devDependency only, for the build step (issue #41).
  No other new dependencies added by this track (`firebase/functions` used by
  `llmProxyClient.ts` ships inside the `firebase` package 6d already added to `app/package.json`).
