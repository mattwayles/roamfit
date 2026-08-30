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

### Done (cont'd)
- [x] `npm run check` passes end to end (typecheck + lint + test + engine-purity), exit 0.
- [x] Proved `tools/check-engine-purity.js` fails: added `import { View } from 'react-native'`
  to `packages/engine/src/index.ts`, ran `npm run check:engine-purity`, got exit 1 with a
  clear message pointing at the offending line; reverted the probe, re-ran, exit 0 again.
- [x] Committed as `5048e5f` (app typecheck/lint/test fixes — see decisions below for the
  testing-library swap).

### Done (cont'd, 2)
- [x] `npx expo prebuild --platform ios --non-interactive` succeeded in `app/`: created
  `app/ios/` (Podfile, `RoamFit.xcworkspace`, `RoamFit.xcodeproj`), ran prebuild, installed
  CocoaPods — all exit 0.
- [x] `npm run ios` (== `expo run:ios` from repo root, workspace `app`) built the native app
  with Xcode (0 errors, 1 non-blocking warning about a script build phase) and installed +
  launched it on the booted "iPhone 17 Pro" (iOS 26.5) simulator — exit 0.
- [x] **Verified visually, not just by exit code.** First launch attempt showed a runtime
  error because port 8081 (Metro's default) was already occupied by an unrelated project on
  this machine (`/Users/mattwayles/Development/unpack`), and `expo run:ios` silently skipped
  starting its own dev server rather than picking a free port (non-interactive mode can't
  answer the "use port 8082 instead?" prompt). Fixed by starting Metro explicitly on a free
  port (`npx expo start --dev-client --port 8090` inside `app/`) and opening the dev-client
  deep link at that port (`xcrun simctl openurl booted
  "exp+roamfit://expo-development-client/?url=http%3A%2F%2F<lan-ip>%3A8090"`). Screenshot
  after that confirmed the dev-launcher correctly identified itself as "RoamFit" (not the
  other project) and downloaded the JS bundle; after continuing past the one-time dev-menu
  explainer, the simulator showed the actual placeholder screen: "RoamFit" / "Skeleton boots.
  Nothing to see yet." Screenshots were temporary verification artifacts, not committed.

### Done criteria (from wave-01a-skeleton.md) — final status
- [x] `npm install` from a clean clone succeeds.
- [x] `npm run check` passes (typecheck + lint + test, all workspaces).
- [x] `npm run ios` builds and launches the placeholder on the simulator — verified by
  screenshot, not just exit code (see above).
- [x] Engine-purity check script exists; proved it fails on a violating import, then reverted
  the probe.
- [x] Status file accurate; work committed in increments.

**All done criteria for 1a-skeleton are met.** Nothing outstanding for this track unless a
fresh agent finds `npm run check` or the native build newly broken (e.g. after a dependency
bump) — in that case, treat this file as the map of how everything is wired and fix forward.

### In progress
- None — track complete as of this entry.

### Next
- Nothing required for 1a-skeleton itself. For whoever wires wave 2+: note the `expo run:ios`
  port-8081-collision gotcha below if this machine is reused with other Expo projects running
  concurrently.

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
  `eslint-config-prettier`, `eslint-plugin-prettier`, `globals`, `prettier`, `typescript`.
  `app/`: `expo`, `expo-dev-client`, `expo-status-bar`, `react`, `react-native` (deps);
  `@react-native/jest-preset` (jest-expo peer), `@types/jest`, `@types/react`,
  `@types/react-test-renderer`, `jest`, `jest-expo`, `react-test-renderer`, `typescript`
  (devDeps). Note: `@testing-library/react-native@14.0.1`'s `render()` returned an empty
  `{}` under this exact combo of React 19.2 / RN 0.86 / jest-expo 57 (its internal `screen`
  singleton never got populated, "render function has not been called") — dropped it in
  favor of plain `react-test-renderer` + `act()`, which is boring and works. Worth retrying
  testing-library once a wave-4 UI track needs real queries — it may just need a setup file
  this skeleton didn't add.
  `packages/engine` and `packages/data` (data wiring only — content is 1b's):
  `@types/jest`, `@types/node`, `jest`, `ts-jest`, `typescript`.
- **`expo run:ios` + non-interactive mode + port 8081 already in use = silent wrong-app
  connection, not a build failure.** If another Expo project's Metro is already running on
  8081 on the same machine, `expo run:ios` can't prompt (non-interactive) so it prints
  "Skipping dev server" and the freshly-installed app's dev-client deep-links to whatever
  *is* on 8081 — which may be a completely different project, producing a confusing runtime
  error in the *other* project's JS, not ours. Fix: start Metro yourself on a free port
  (`npx expo start --dev-client --port <N>` in `app/`) and open the dev-client deep link at
  that port manually: `xcrun simctl openurl booted
  "exp+roamfit://expo-development-client/?url=http%3A%2F%2F<lan-ip>%3A<N>"` (use your Mac's
  LAN IP, e.g. `ipconfig getifaddr en0`, not localhost — the simulator needs a reachable
  host). This is an environment quirk of running multiple Expo projects on one machine, not
  a defect in this skeleton.
- **Test runner**: Jest everywhere — `jest-expo` preset for `app/`, `ts-jest` for the two
  packages. Root `npm test` fans out via `--workspaces --if-present`.
- **`app/tsconfig.json`** extends Expo's own `expo/tsconfig.base` (not the root
  `tsconfig.base.json`) with `strict: true` — this is the Expo-recommended baseline that
  correctly configures JSX/module resolution for React Native; the two packages extend the
  root `tsconfig.base.json` instead since they have no RN concerns.
- **Env**: node v26.0.0, npm 11.12.1, Xcode 26.6, iOS simulators available (iPhone 17 Pro /
  Pro Max / 17e, iOS 26.5). Network access to the npm registry confirmed working.
