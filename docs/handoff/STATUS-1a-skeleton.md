## Track: 1a-skeleton — Project skeleton
Last updated: 2026-08-30

### Done
- (starting fresh — no prior run)

### In progress
- Setting up npm workspaces root: package.json, .gitignore, tsconfig base.
- Env notes: node v26.0.0, npm 11.12.1, Xcode 26.6 present, iOS simulators available
  (iPhone 17 Pro / Pro Max / 17e, iOS 26.5).

### Next
- ordered remaining steps:
  1. Root package.json with npm workspaces (app, packages/engine, packages/data).
  2. packages/engine: pure TS package, tsconfig (no RN/DOM libs), src/index.ts stub, one
     Jest/Vitest test.
  3. packages/data: pure TS/JSON package, tsconfig, src/index.ts stub, one test.
  4. app/: Expo TS app via `npx create-expo-app` or manual scaffold, dev-client, iOS only,
     bundle id com.roamfit.app, name RoamFit, placeholder screen.
  5. Root ESLint + Prettier config, TS-aware.
  6. Engine-purity check script (grep-based) forbidding app/ or react-native imports in
     packages/engine. Prove it fails on a violating import, then revert the probe.
  7. Root scripts: check (typecheck+lint+test), ios.
  8. .gitignore for node_modules, ios/android build output, .expo, DerivedData.
  9. README.md replacing stub.
  10. Try `npm install`, `npm run check`, `npx expo prebuild`, `npm run ios` — document what
      actually ran in this environment.

### Decisions / gotchas
- (none yet — fill in as decisions are made)
