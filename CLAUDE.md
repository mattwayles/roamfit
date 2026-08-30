# RoamFit — Project Conventions

Offline-first iOS training app for band + bodyweight training. Full product spec: `spec.md`
(authoritative; section numbers `§N` in code comments and briefs refer to it).

## Ramp-up protocol (read this first, every time)

You may be a fresh agent picking up interrupted work. Before writing any code:

1. Read `docs/ORCHESTRATION.md` — the wave plan and current status board.
2. Read your wave brief in `docs/handoff/wave-NN-*.md` — scope, milestone, done-criteria.
3. Read `docs/handoff/STATUS-<your-track-id>.md` if it exists — the running log left by the
   previous run of your own track. It tells you exactly what is done and what is next.
4. Read only the spec sections your brief names. Do **not** read `spec.md` end to end; it is
   ~28k tokens and will burn your budget before you write a line.
5. `git log --oneline -15` to see what actually landed.

## Interruption protocol (this project will hit session limits mid-task)

- Work in **small committed increments**. Commit every logically complete step, even a partial
  one. A dirty tree at interruption is lost context; a commit is not.
- Keep `docs/handoff/STATUS-<track-id>.md` current. Update it **before** starting each increment,
  not after finishing — if you are cut off mid-increment, the file must already say what you were
  doing. Format:
  ```
  ## Track: <id> — <name>
  Last updated: <date>
  ### Done
  - [x] step, with the commit sha
  ### In progress
  - <exact next action, file paths, and any decision already made>
  ### Next
  - ordered remaining steps
  ### Decisions / gotchas
  - things a fresh agent would otherwise re-litigate
  ```
- Never leave the build broken at a commit boundary. `npm run check` must pass.
- If you cannot finish, that is expected and fine. Leave the status file accurate and stop.

## Stack

- React Native + Expo (dev-client, config plugins), **iOS only**. TypeScript strict.
- SQLite is the source of truth (op-sqlite + Drizzle). All reads/writes local-first.
- Firebase (Firestore + Auth) is a **sync target only** — never on the critical path.
- Generation engine: pure TypeScript, no I/O, no network, fully unit-testable.
- LLM: Claude via a Cloud Function proxy. Key never ships in the bundle.

## Non-negotiable invariants

These are release gates, not preferences. Do not trade them away for convenience.

1. **Offline is not a degradation mode.** Generate, approve, run, complete, log, and view the
   dashboard must all work with zero connectivity (§11.1, §11.6).
2. **The engine decides; the LLM decorates.** The LLM never selects exercises, sets loads, or
   relaxes a filter (§7.2).
3. **Safety filters live in code, before any model sees anything** — injuries, anchor class,
   the bodyweight-bearing effort cap (§13.1, §13.2).
4. **Never punish.** No streaks, no red days, no guilt copy (§1.1, §9).
5. **`level_id` is a stable identifier, never an array index** (§4.2, §6.6).
6. **All calendar math uses `local_date`**, never UTC (§12).
7. **Per-user state never lives on the shared exercise library table** (§4.4).
8. **Never invent a YouTube video id.** Curated ids live in remote config only (§11.4).

## Layout

```
app/            Expo React Native app (screens, components, native concerns)
packages/
  engine/       pure TS generation + progression engine — no RN imports, no I/O
  data/         exercise library, progression families, schemas, validators
docs/
  ORCHESTRATION.md      wave plan + status board
  handoff/              per-wave briefs and per-track status logs
  decisions/            ADRs for anything that deviates from spec.md
tools/          operator CLIs (video_db.py, library build/validate scripts)
```

## Rules

- `packages/engine` must never import from `app/` or from React Native. It is pure and testable
  in node. This is what makes the engine verifiable.
- Anything that contradicts `spec.md` needs an ADR in `docs/decisions/` explaining why. Do not
  silently deviate; do not silently re-scope.
- Write tests with the code, in the same commit. The engine target is meaningful coverage of the
  §5.2 selection rules and §6.3 progression rules — those are the product.
- Match surrounding code style. No new dependencies without noting them in the status file.
