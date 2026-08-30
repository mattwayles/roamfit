# RoamFit — Build Orchestration

Opus orchestrates; Sonnet subagents implement. Work proceeds in **waves**. Each wave has a
concrete milestone, is summarized to the user, and requires approval before the next begins.

Every track is written to be **interrupted**. See the interruption protocol in `CLAUDE.md`.

## Status board

| Wave | Milestone | Status |
|---|---|---|
| 1 | Skeleton boots + full library/ladder data validated | **done** — verified `38fef15`/`5048e5f` |
| 2 | Generation engine passes golden tests, <50ms, no I/O | brief ready, awaiting dispatch |
| 3 | SQLite persistence + session lifecycle + signal capture | not started |
| 4 | Core workout loop end-to-end on device | not started |
| 5 | Motivation surfaces: progression board, dashboard, passport | not started |
| 6 | Media ladder, LLM proxy, Firebase sync, HealthKit | not started |
| 7 | Airplane-mode acceptance gate + instrumentation + polish | not started |

## Wave plan

### Wave 1 — Foundations & content
Two independent tracks.
- **1A · skeleton** — Expo dev-client TS app that boots on the iOS simulator; monorepo layout;
  test runner; `npm run check`. No product UI.
- **1B · content** — Port the 196-record prototype library to the §4.1 schema (new fields:
  `anchor_class`, `metric`, `default_seconds`, `role`, `contraindications[]`,
  `progression_family`, `progression_level_id`). Author the 8 §6.6 progression families.
  Ship a validator that fails CI on any inconsistency.

**Milestone:** app boots; `npm run validate:library` passes over a complete, correctly tagged
196-record library and 8 ladders.

### Wave 2 — The generation engine
Pure TS, `packages/engine`. The §5.1 pipeline (hard filters → template → selection → progression
→ prescription → time fit → explain), §5.2 selection rules ported verbatim from the prototype,
§5.4 effort table, §5.5 focus templates, §5.6 time budget, §5.7 band selection, §6 progression
and micro-progression, §6.5 calibration, §9.4 comeback, §9.5 Quick Session as the same pipeline.

**Milestone:** golden-test suite green; deterministic; sub-50ms; zero I/O imports.

### Wave 3 — Persistence & session lifecycle
SQLite schema for §4.3–§4.7, repositories, planned-vs-actual set logging, the full §8.3 implicit
signal capture, progression state updates on completion, pending-session resumability, crash
safety. Still headless — driven by tests.

**Milestone:** a scripted five-session run mutates progression, exercise state, and history
correctly, with no network.

### Wave 4 — Core workout loop (UI)
Home (§10.1) → Generate (§10.2) → Approval (§10.3) → Active rep-based (§10.4) → Active timed
(§10.5) → Rest timer (§10.7) → Summary (§10.9). Mid-workout swap (§10.6). Device behavior
(§10.8): keep-awake, wall-clock timers, background audio, haptics.

**Milestone:** a full workout can be generated, run, and completed on the simulator, offline.

### Wave 5 — Motivation surfaces
Progression board, Next Unlock, dashboard (§14), passport (§9.6), milestones and level-up
celebration (§6.4, §9.7), weekly targets and dots (§9.1), travel days (§9.3), comeback path
(§9.4), Recovery Week (§9.9), Quick Session button (§9.5), notifications (§9.8), share cards
(§9.10).

**Milestone:** the dashboard is meaningful at zero sessions and after twenty.

### Wave 6 — Network layer
In-house line-art figures (§11.4 tier 2, all exercises), the three-tier media ladder, Cloud
Function LLM proxy (§7.3), Firestore sync + delta library updates (§11.3), HealthKit write
(§13.4), `video_db.py` operator CLI (§11.5).

**Milestone:** every network feature degrades to nothing without blocking the core loop.

### Wave 7 — Acceptance & instrumentation
The §11.6 release gate: airplane mode from before first launch, five workouts across three days,
everything functional. Plus §15 product instrumentation and polish.

**Milestone:** release gate passes on a clean install.

## Conventions for dispatch

- One Sonnet subagent per track. Tracks within a wave are chosen to not collide on files.
- Every subagent gets: its brief path, its status-file path, and the specific spec sections to
  read. Never "read the spec."
- A resumed track is dispatched with the same brief; the status file carries the delta.
- **One track per wave touching the repo root**, or serialize them. Wave 1 ran two agents in one
  working tree and they raced on the shared git index twice — files from one track swept into the
  other's commit. Nothing was lost, but attribution got muddled. For later waves either isolate
  concurrent tracks in git worktrees or keep concurrency to genuinely disjoint subtrees.

## Carried-forward issues

Open items surfaced by a completed wave that a later wave or a human must close.

| # | Item | Raised | Owner |
|---|---|---|---|
| 1 | 32 exercises carry no `contraindications[]`; whole set wants a trainer/physio review pass. §13.2 hard filter and the pregnancy preset depend on it. **Should not ship unreviewed.** | 1B | human, pre-launch |
| 2 | `bw-inverted-row` classed `pullup-bar` / `bodyweight_bearing` (off by default, effort-capped) — arguably too strict for a partial-support row. | 1B | human |
| 3 | Warmup pool is 9 records, cooldown 12 (only 4 each tagged `abs`). §5.2 BLOCKED would exhaust it. Resolve via ADR in Wave 2; consider a content top-up later. | orchestrator | Wave 2 |
| 4 | `hamstring-curl`/`tke` tagged `hip_extension` — §4.1's pattern enum has no knee-flexion/extension bucket. Taxonomy gap. | 1B | Wave 2 to confirm harmless |
| 5 | Conditioning finishers forced to `tier: fill` with a primary-mover pattern. Confirm this matches how the engine treats finishers (§5.5 `full` template). | 1B | Wave 2 |
| 6 | `@testing-library/react-native` `render()` returned empty under this stack; `react-test-renderer` used instead. Retry when Wave 4 needs real queries. | 1A | Wave 4 |
