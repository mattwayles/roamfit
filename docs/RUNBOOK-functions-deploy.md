# Operator runbook — deploying `functions/` (§7.3 LLM proxy)

Nothing in this file has been run from this environment: there are no credentials, no Firebase
project, and no Anthropic API key here, and none should ever be committed to this repo (CLAUDE.md
hard constraint — this file names none). This is the exact command sequence for a human operator
with real credentials to actually deploy the Cloud Functions this project has built and unit
tested, plus the one thing that still cannot be verified without doing so: prompt caching
(issue #36).

Track `6f-deploy` closed the *build* gap (issue #41) — `functions/` now has a real `npm run build`
(esbuild bundle → `lib/index.js`, verified loadable in a plain Node process by
`functions/src/build.test.ts`) and `firebase.json`'s `predeploy` runs it. Track `6d-sync-health`
added the Firebase project config (`firebase.json`, `.firebaserc`, `firestore.rules`,
`firestore.indexes.json`) but never attempted a deploy. This runbook is the first place all of
that comes together into one ordered procedure.

## 0. Prerequisites

- A real Firebase project (Blaze/pay-as-you-go plan — Cloud Functions v2 requires it even for
  usage that stays inside the free tier).
- A real Anthropic API key with access to `claude-opus-5` and `claude-haiku-4-5`.
- Node 20.x locally (matches `functions/package.json`'s `engines.node`) and `npx firebase-tools`
  (no need to install it globally; every command below can be run via `npx`).
- Run every command from the repo root unless noted otherwise.

## 1. Authenticate and pick a project

```bash
npx firebase-tools login
```

Either create a new project or use an existing one:

```bash
npx firebase-tools projects:create        # or: use an existing project id
```

Put the real project id in `.firebaserc`, replacing the placeholder:

```bash
# .firebaserc currently contains "REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID" — edit it to the
# real project id. Do not commit this change to a shared/public branch of this repo without
# checking whether the project id itself should stay private for your organization.
```

## 2. Enable the products this app uses

In the Firebase console for that project:

- **Firestore** — enable in production mode (not test mode — `firestore.rules` already ships the
  real per-uid rules).
- **Authentication → Anonymous** — enable the Anonymous sign-in provider (the app's
  `firestoreSyncClient.ts`/`llmProxyClient.ts` both authenticate anonymously; there is no login UI
  in v1).

## 3. Set the Anthropic API key as a Cloud Functions runtime secret

**This is the only place `ANTHROPIC_API_KEY` should ever be set.** Never put it in a `.env` file,
never commit it, never pass it as a plain (non-secret) function config value.

```bash
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
# Prompts for the value interactively — paste the real key, press enter.
```

Confirm it was created (this only shows metadata, never the value):

```bash
npx firebase-tools functions:secrets:access ANTHROPIC_API_KEY
```

`functions/src/index.ts` already binds this secret to all three callables
(`onCall({ secrets: [anthropicApiKey] }, ...)`) — no code change needed here.

## 4. Build and typecheck locally (optional — deploy does this for you)

```bash
npm --prefix functions run typecheck
npm --prefix functions run build
```

`firebase deploy`'s `predeploy` hook (configured in `firebase.json`) runs exactly these two
commands automatically before every functions deploy, so this step is only useful to catch a
problem before you get to the deploy step. `npm run build` produces `functions/lib/index.js` — a
self-contained CommonJS bundle with `@roamfit/engine`/`@roamfit/data` inlined (workspace-local
packages, never published to npm) and real npm dependencies (`firebase-functions`,
`@anthropic-ai/sdk`, `zod`) left external for `npm install` to fetch normally during the Cloud
Build step.

## 5. Deploy

Deploy Firestore rules/indexes and the functions together, or separately:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
npx firebase-tools deploy --only functions
```

Watch the deploy output for the Cloud Build log — this is the step that will surface a workspace-
dependency problem for the first time in this project's history (nothing here has run against a
real Cloud Build environment before). If it fails on an unresolvable `@roamfit/*` import, check
that `functions/package.json`'s `dependencies` (not `devDependencies`) contains only real,
publishable npm packages — `@roamfit/engine` must **not** be listed there; it is bundled into
`lib/index.js`, not installed.

## 6. Check the deploy actually worked

```bash
npx firebase-tools functions:list
```

should show `llmIntake`, `llmCoachVoice`, `llmDistillFeedback` as `v2` callable functions,
`ACTIVE`.

Call one directly to confirm the whole chain (auth → secret → Anthropic call → validation →
response) works, using the Firebase console's "Test function" panel, or the `firebase-tools`
shell:

```bash
npx firebase-tools functions:shell
# inside the shell:
llmIntake({ freeformText: 'legs, 20 minutes, hard' })
```

A healthy response looks like `{ result: { params: { focus: 'legs', effort: 'hard',
targetMinutes: 20, ... }, suggestedLimitationTag: null, repaired: false,
cacheReadInputTokens: <number> } }`. If `params` is `null`, the deterministic fallback fired —
check the Cloud Logging output from the same call (next section) for why, before assuming
anything is broken; a single odd model response falling back is expected/normal per §7.3, not a
bug.

## 7. Wire the app to this project

The app-side Firebase client config is six public (non-secret) values from the Firebase console's
web app settings, read from `process.env.EXPO_PUBLIC_FIREBASE_*` by both
`app/src/lib/firestoreSyncClient.ts` (6d) and `app/src/lib/llmProxyClient.ts` (6f, issue #34):
`EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`,
`_MESSAGING_SENDER_ID`, `_APP_ID`. Set these via `app.config.js`/EAS secrets — never hardcode
them in a committed file. Once set, `createLlmProxyCaller()` stops returning `null` and
`opportunisticSync.ts` starts actually draining the LLM queue on Home-screen focus.

---

## Issue #36 — verifying prompt caching, the exact procedure

§7.3's done-criterion is explicit: *"Verify with `usage.cache_read_input_tokens` — a persistent
zero means something in the prefix is varying."* This has never been observed against a live API
call from this project (no key, no deployment, in every environment this codebase has been
developed in so far). **This criterion stays OPEN until an operator runs the steps below against
a real deployment — do not treat it as closed by the structural proof alone** (the structural
proof — `functions/src/prompt.test.ts`/`intake.test.ts`/`distill.test.ts` pinning that the cached
system block is byte-identical across differing volatile inputs, and that untrusted text never
enters it — is real and independently re-verified per `ORCHESTRATION.md`'s verification log, but
it is a proof about the *code*, not an observation about the *live API's actual cache behavior*).

Track `6f-deploy` made the value **observable**: every callable now emits one structured
`llm_proxy_call` log line (via `functions/src/handlers.ts`'s injected `LogSink`, defaulting to
`firebase-functions`'s `logger.info` in production) with `cacheReadInputTokens` as its own
top-level JSON field, alongside `job`, `model`, `repaired`, `usedFallback`. This is what makes the
check below possible; before this it existed only inside a return value nothing captured.

### What to run

1. Make at least two calls to the **same** callable within the cache TTL (5 minutes for
   `ephemeral` cache control) — e.g. two `llmIntake` calls a few seconds apart via
   `functions:shell` (step 6 above), or trigger it twice from the real app.
2. In the Firebase console, go to **Functions → (pick the function) → Logs**, or run:

   ```bash
   npx firebase-tools functions:log --only llmIntake
   ```

   or, for a structured query in Google Cloud Logging directly:

   ```
   resource.type="cloud_function"
   resource.labels.function_name="llmIntake"
   jsonPayload.event="llm_proxy_call"
   ```

   (the console's Logs Explorer lets you add `jsonPayload.cacheReadInputTokens` as a displayed
   column, or chart it directly).

### What a healthy result looks like

- **First call in a while** (cold cache, or >5 minutes since the last call to that job): expect
  `cacheReadInputTokens: 0` — this is correct and expected, not a failure. There is nothing to
  read from cache yet.
- **A second call to the same job within the TTL**: expect `cacheReadInputTokens` to be a
  **non-zero number roughly matching the size of the stable system prompt** for that job (a few
  hundred tokens — `INTAKE_SYSTEM_PROMPT`/`COACH_VOICE_SYSTEM_PROMPT`/`DISTILL_SYSTEM_PROMPT` in
  `functions/src/jobs/*.ts` are all short, so expect low hundreds, not thousands).

### What a persistent zero means

If **every** call — including back-to-back calls to the same job seconds apart — logs
`cacheReadInputTokens: 0`, the cache is never hitting. Per §7.3, this means **something in the
prefix is varying** between calls when it should be byte-identical. Given this codebase's actual
prompt construction (`functions/src/prompt.ts`'s `buildStableSystemBlock`), the most likely
culprits, in order of likelihood, are:

1. **A per-request value leaking into the system block.** Every job's system prompt is a fixed
   string constant today (`INTAKE_SYSTEM_PROMPT` etc. in `functions/src/jobs/*.ts`) — but
   `distill.ts` interpolates `input.sessionExerciseIds` *into* its system block
   (`` `${DISTILL_SYSTEM_PROMPT}\n\nThis session's exercise ids: ${JSON.stringify(...)}` ``, line
   ~52). **This is a real, already-present variance source**: two different sessions have two
   different exercise-id lists, so `llmDistillFeedback`'s cache will *never* hit across sessions
   by construction — only repeated calls for the *same* session within the TTL would ever see a
   cache read. If a persistent zero shows up specifically on `llmDistillFeedback` even for
   same-session repeat calls, look here first. (`intake.ts`/`coachVoice.ts` do not do this — their
   system blocks are the literal constant string, unconditionally cacheable across all users and
   sessions.)
2. **`maxTokens` or `model` differing between calls to the same job** — neither should ever
   happen given the code (`maxTokens: 512` and the model constant are both fixed per job), but
   worth ruling out first if (1) doesn't explain it, by diffing two calls' actual `system` field
   in the request (add a temporary debug log of the exact `system` array, redacted of anything
   sensitive, and byte-compare).
3. **Cache TTL exceeded** — calls more than ~5 minutes apart never hit; confirm the two calls
   being compared are close together in time.
4. **Anthropic-side minimum cacheable prefix length** — very short system prompts may fall under
   the platform's minimum token count for caching to apply at all; check the current minimum
   against the `claude-api` skill/Anthropic's docs if the prompt content itself is confirmed
   stable and TTL isn't the issue.

Once a non-zero `cacheReadInputTokens` has actually been observed on a live repeat call, update
`ORCHESTRATION.md`'s issue #36 entry (or the wave status board) to reflect that the done-criterion
is met, with the observed value and the log line it came from as evidence — not before.
