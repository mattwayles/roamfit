# RoamFit

Offline-first iOS training app for band + bodyweight training, for people who travel and can't
rely on a gym.

Originally built from a written spec, now driven directly by user feedback. That spec, its wave
plan and its ADRs have been deleted; [`docs/BACKLOG.md`](./docs/BACKLOG.md) is the single tracker
for everything still to do. `§N` and `ADR 00NN` references in code comments point at those deleted
documents — the prose around them still carries the reasoning.

## Layout

```
app/            Expo React Native app (screens, components, native concerns)
packages/
  engine/       pure TS generation + progression engine — no RN imports, no I/O
  data/         exercise library, progression families, schemas, validators
docs/
  BACKLOG.md             the single tracker: features, bugs, debt, verification owed
  handoff/               per-track status logs (historical for finished tracks)
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
