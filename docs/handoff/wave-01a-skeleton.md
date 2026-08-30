# Wave 1A — Project skeleton

**Track id:** `1a-skeleton` · **Status file:** `docs/handoff/STATUS-1a-skeleton.md`
**Spec sections to read:** §3 (Foundation) only. Do not read the whole spec.

## Goal

A React Native + Expo TypeScript monorepo that boots on the iOS simulator and has a working
test/typecheck/lint gate. No product UI, no engine logic, no data. Just the floor everything
else stands on.

## Scope

1. **Monorepo layout** per `CLAUDE.md`:
   - `app/` — Expo app (dev-client, config plugins; iOS only)
   - `packages/engine/` — pure TS, no RN imports (empty but wired: index, tsconfig, tests)
   - `packages/data/` — pure TS/JSON (empty but wired)
   - Use npm workspaces. Keep it boring; do not add a monorepo build tool.
2. **Expo app**: dev-client (not Expo Go — the app needs HealthKit, background audio, and
   keep-awake config plugins later). `app.json`/`app.config.ts` set up for iOS only, bundle id
   `com.roamfit.app`, name RoamFit. It must launch to a placeholder screen.
3. **TypeScript strict** across all workspaces, with `packages/engine` configured so it typechecks
   and tests in plain node with no RN types leaking in.
4. **Test runner**: Jest (with `jest-expo` for `app/`) or Vitest for the packages — your call, but
   both workspaces must run under one root `npm test`. Include one trivial passing test per
   workspace to prove wiring.
5. **Lint/format**: ESLint + Prettier, TS-aware. Add a lint rule or a check script that fails if
   `packages/engine` imports from `app/` or from `react-native` — invariant 1 in `CLAUDE.md` and
   the thing that keeps the engine verifiable. A simple grep-based script is acceptable.
6. **Root scripts**: `npm run check` = typecheck + lint + test. This is the commit gate for every
   future track. Also `npm run ios`.
7. `.gitignore` for node_modules, ios/android build output, `.expo`, DerivedData.
8. A short `README.md` replacing the stub: what this is, how to run it, where the spec lives.

## Out of scope — do not build

Navigation libraries beyond what a placeholder needs, state management, UI kits, screens, the
database, Firebase, any engine logic, any exercise data. Later waves own those and will pick
their own tools.

## Done criteria

- [ ] `npm install` from a clean clone succeeds.
- [ ] `npm run check` passes (typecheck + lint + tests, all workspaces).
- [ ] `npm run ios` builds and launches the placeholder on the simulator. If the native build
      cannot complete in your environment, `npx expo prebuild` succeeding plus a documented
      reason in the status file is acceptable — say so plainly rather than claiming it ran.
- [ ] The engine-purity check script exists and actually fails when given a violating import
      (prove it, then revert the probe).
- [ ] Status file accurate; work committed in increments.

## Notes

- Pin dependency versions. Note every dependency added, and why, in the status file.
- Do not scaffold "example" screens or boilerplate you would immediately delete.
