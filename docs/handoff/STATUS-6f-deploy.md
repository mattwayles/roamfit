## Track: 6f-deploy — close #41 (functions build), #34 (app LLM wiring), #36 (caching verification)
Last updated: 2026-09-01

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
      `functions/lib/**` (the bundle isn't hand-written source, don't lint it). Commit TBD.
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

### In progress
Starting issue #34 next — `LlmProxyCaller` app-side implementation, following
`firestoreSyncClient.ts` + `opportunisticSync.ts`'s established shape (lazy-loaded `firebase/functions`
`httpsCallable`, degrades to a no-op/never-called caller when unconfigured, wired into
`opportunisticSync.ts` behind its own try/catch, never on the critical path).

### Next
- Issue #34: `app/src/lib/llmProxyClient.ts` (the `LlmProxyCaller` implementation),
  wire `processLlmQueue` into `opportunisticSync.ts`.
- Issue #36: make `cacheReadInputTokens` observable via a structured log line in the Cloud
  Function jobs; write the exact verification procedure into the operator runbook.
- Write the operator runbook (deploy commands in order incl. `firebase functions:secrets:set
  ANTHROPIC_API_KEY`, and the cache-verification procedure).
- Final status update + report to orchestrator.

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

### What I verified, and how
See the "Issue #41" bullet above for the build-artifact verification and its mutation test.

### Carried-forward issues (for the orchestrator to file)
None yet — will finalize this section once #34/#36 are done.
