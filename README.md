# RoamFit

Offline-first iOS training app for band + bodyweight training, for people who travel and can't
rely on a gym. Full product spec lives in [`spec.md`](./spec.md) — section numbers (`§N`)
referenced in code comments and handoff docs point there.

## Layout

```
app/            Expo React Native app (screens, components, native concerns)
packages/
  engine/       pure TS generation + progression engine — no RN imports, no I/O
  data/         exercise library, progression families, schemas, validators
docs/
  ORCHESTRATION.md      wave plan + status board
  handoff/               per-wave briefs and per-track status logs
  decisions/             ADRs for anything that deviates from spec.md
tools/          operator CLIs and repo-hygiene scripts (e.g. engine-purity check)
```

This is an npm workspaces monorepo (`app`, `packages/engine`, `packages/data`). No extra
monorepo build tool.

## Running it

```bash
npm install

# typecheck + lint + test, every workspace — the commit gate for every change
npm run check

# build and launch the dev-client on the iOS simulator
npm run ios
```

The app targets **iOS only**, via Expo's dev-client (not Expo Go — HealthKit, background audio,
and keep-awake need config plugins Expo Go doesn't support).

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the full set of project conventions, the non-negotiable
product invariants, and the interruption protocol used across build waves.
