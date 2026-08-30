## Track: 1a-skeleton — Project skeleton
Last updated: 2026-08-30

### Done
- [x] Root npm workspaces wired: `package.json` (workspaces app, packages/engine,
  packages/data), `tsconfig.base.json`, `.gitignore`, `.prettierrc.json`, `eslint.config.js`
  (flat config, TS-aware, prettier integration), `tools/check-engine-purity.js`.
- [x] `app/`: scaffolded via `create-expo-app@latest --template blank-typescript`, then
  reconfigured: `app.json` (name RoamFit, slug roamfit, iOS only, bundleIdentifier
  com.roamfit.app, `expo-dev-client` plugin), `package.json` (dev-client scripts: `start`
  uses `--dev-client`, `ios` uses `expo run:ios`, `prebuild` for `expo prebuild --platform
  ios`), placeholder `App.tsx` + `App.test.tsx` (jest-expo + @testing-library/react-native).
  Removed create-expo-app's own scaffolded `.claude/`, `AGENTS.md`, `CLAUDE.md`, `LICENSE`,
  `.gitignore` (root .gitignore covers it).
- [x] `packages/engine`: `package.json`, `tsconfig.json` (extends root base, no RN/DOM libs),
  `jest.config.js` (ts-jest, node env), `src/index.ts` placeholder + `src/index.test.ts`.
- [x] `npm install` from clean root succeeds (572 packages added, no unresolved peer errors).
- [x] Committed as `6e5ae14` — see "Decisions / gotchas" below re: this commit also contains
  the concurrent 1b-content track's work (packages/data schema/validate/library +
  STATUS-1b-content.md). Not something I chose; explained below.

### In progress
- About to run `npm run check` (typecheck + lint + test + engine-purity) for the first time
  and fix whatever it finds.

### Next
- ordered remaining steps:
  1. Run `npm run check`, fix issues (expect first-run friction: eslint flat config vs.
     jest-expo's own config, `tsc --noEmit` in app using `expo/tsconfig.base`, etc).
  2. Prove the engine-purity script actually fails: temporarily add a `from 'react-native'`
     import to `packages/engine/src/index.ts`, run `npm run check:engine-purity`, confirm
     non-zero exit + message, then revert.
  3. `npx expo prebuild --platform ios` inside `app/` (or `npm run prebuild --workspace app`)
     — document whether it succeeds.
  4. `npm run ios` — attempt `expo run:ios` against a booted simulator (iPhone 17 Pro,
     iOS 26.5, available per `xcrun simctl list devices`). Document actual outcome honestly
     — if the native build doesn't complete in this environment, prebuild succeeding is the
     documented fallback per the brief's done criteria.
  5. Mark done criteria complete in this file once verified.

### Decisions / gotchas
- **Shared git index with the concurrent 1b-content track**: this repo has no worktree
  isolation between the two wave-1 tracks — both agents share one `.git` and one working
  tree. Twice, files I `git add`ed were swept into the *other* track's commit because their
  `git commit` ran between my `git add` and my `git commit` (same shared index). Net effect:
  commit `6e5ae14` ("1b-content: schema, migration, validator, and tagged 196-exercise
  library") contains **both** tracks' Wave-1 work — all of 1a-skeleton's files plus 1b's
  `packages/data/*`. I did not intend to commit into their message/attribution; this is a
  structural race, not a scope violation — I never edited their file contents. If a fresh
  agent resumes either track: **do not try to rewrite this shared history** (no reset/rebase
  surgery) — the file contents are correct and nothing is lost. Just keep committing forward.
  To reduce recurrence, `git add` only the exact paths for this track immediately before
  `git commit`, and re-check `git status --porcelain` right before the commit call in case
  another agent staged something first.
- **TypeScript pinned to 6.0.3**, not the newer 7.0.2 or the 5.x line: `ts-jest@29` requires
  `typescript >=4.3 <7`, and `@typescript-eslint@8.68` requires `typescript >=4.8.4 <6.1.0`.
  6.0.3 is the newest version satisfying both. This is what `create-expo-app` picked by
  default too, so all workspaces are aligned on it.
- **ESLint pinned to 9.39.5** (not 10.x): kept in the `9.x` line typescript-eslint has the
  longest track record with; still satisfies typescript-eslint's `^8.57||^9||^10` peer range.
- **New dependencies added** (all pinned exact versions, no `^`/`~`):
  root: `@eslint/js`, `@typescript-eslint/eslint-plugin`/`parser`, `eslint`,
  `eslint-config-prettier`, `eslint-plugin-prettier`, `prettier`, `typescript`.
  `app/`: `expo`, `expo-dev-client`, `expo-status-bar`, `react`, `react-native` (deps);
  `@react-native/jest-preset` (jest-expo peer), `@testing-library/react-native`, `jest`,
  `jest-expo`, `test-renderer` (React 19's replacement for the deprecated
  `react-test-renderer`), `typescript` (devDeps).
  `packages/engine` and `packages/data` (data wiring only — content is 1b's):
  `@types/jest`, `@types/node`, `jest`, `ts-jest`, `typescript`.
- **Test runner**: Jest everywhere — `jest-expo` preset for `app/`, `ts-jest` for the two
  packages. Root `npm test` fans out via `--workspaces --if-present`.
- **`app/tsconfig.json`** extends Expo's own `expo/tsconfig.base` (not the root
  `tsconfig.base.json`) with `strict: true` — this is the Expo-recommended baseline that
  correctly configures JSX/module resolution for React Native; the two packages extend the
  root `tsconfig.base.json` instead since they have no RN concerns.
- **Env**: node v26.0.0, npm 11.12.1, Xcode 26.6, iOS simulators available (iPhone 17 Pro /
  Pro Max / 17e, iOS 26.5). Network access to the npm registry confirmed working.
