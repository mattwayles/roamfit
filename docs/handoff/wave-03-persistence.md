# Wave 3 — Persistence & session lifecycle

**Track id:** `3-persistence` · **Status file:** `docs/handoff/STATUS-3-persistence.md`
**Spec sections to read:** §4.3–§4.7, §8.1–§8.3, §10.10, §11.1, §11.3, §12, §9.1, §9.3, §9.9.
Do not read the whole spec. Also read `packages/engine`'s public API — you are the layer that
feeds it and stores what comes back.

Still headless. No screens. This wave is driven entirely by tests, so that Wave 4 builds UI over
a storage layer already known to be correct.

## Goal

`packages/store/` (or `app/src/db/` if the RN-native binding makes a pure package impractical —
decide, and record the choice in an ADR): a local-first SQLite layer that is the **source of
truth** for everything the app knows, with a session lifecycle that survives a force-quit.

## Schema

Model §4.3 (User), §4.4 (User Exercise State), §4.5 (User Progression State), §4.6 (Session),
§4.7 (Session Entry & Set Log). Use Drizzle with op-sqlite per §3.

Points where the spec is explicit and the schema must not drift:

- **Per-user state never lives on the shared exercise library table** (§4.4, invariant 7). Exercise
  state is keyed per user × exercise; the bundled library stays read-only.
- **`progression_level_id` is a stable id, never an index** (§4.2, §4.5, invariant 5). Store it as
  the id string. Entries also record `progression_level_id_at_time` (§4.7) so history stays
  interpretable after a ladder changes.
- **Every session stores the triple** `utc_instant`, `local_date`, `tz_id` (§4.6, §12). All
  calendar math — the rolling 7-day window, week streak, heatmap, "days since" — uses `local_date`
  (invariant 6). Provide the date helpers here so no caller is tempted to reach for UTC.
- **Planned-vs-actual is recorded, not overwritten** (§4.7). The plan is preserved alongside what
  happened. This is the substrate for every §8.3 signal — a schema that overwrites the plan
  destroys the product's learning loop.
- Sessions are append-only; `updated_at` is monotonic (§11.3), ready for last-write-wins sync in
  Wave 6. Do not build sync now — just do not foreclose it.

## Migrations

Set up a real migration mechanism from the first commit, not after the schema settles. Users will
have data across App Store releases; a schema you cannot evolve is a rewrite later.

## Session lifecycle

- `planned → active → completed | discarded` (§4.6).
- **Only one pending session may exist** (§10.10). Generating another prompts resume-or-discard.
  Nothing reaches history except through completion — this mirrors the prototype's rule and is a
  hard invariant, not UI politeness.
- **Crash safety (§10.8): state persists per set.** A force-quit resumes exactly where it left
  off. Test this by killing and reconstructing the store mid-session.
- Completion (§10.9) is one transaction: write history, persist feedback, apply progression
  updates, update exercise state, write the milestone rows, and enqueue the deferred work (LLM
  distillation, HealthKit, passport geocode). **The queues are written here; their workers are
  Wave 6.** Completion must succeed with zero connectivity (§11.1) — anything network-bound is
  enqueued, never awaited.

## Signal capture (§8.3) — capture all of it

This list is the specification and all of it is recorded: reps/seconds vs prescribed per set; set
status completed/skipped/not-reached; time-under-set; best-set improvement; rest taken vs
prescribed and `+15s` tap count; pause count and duration; session duration vs estimate;
exercises removed at approval; mid-workout swaps with what→what and at which set; sets added or
deleted at approval; regenerate taps and consecutive count; demo-media expansions; pinned-note
creation/edits; abandonment point (exercise and set); time of day and day of week; days since last
session; **device timezone change** (§9.3 travel detection).

§1.1: *"Explicit feedback is a bonus; implicit feedback is the system."* Assume the user rates
nothing — if a signal is not captured here, the engine can never learn from it.

Explicit feedback (§8.1) is exactly two optional controls plus one session-level retrospective.
**Unset difficulty means "just right"; unset enjoyment is neutral 3.** Feedback is per-exercise,
not per-set. There is no "equipment used" field — it was removed.

Pinned notes (§8.2) are user-authored, per-user, persist instantly, and are shown verbatim.

## Derived state the dashboard will need

Maintain rolled-up stats incrementally rather than recomputing over full history — §11.3 flags
this for Firestore read cost, and it is also what keeps the dashboard instant offline. Cover:
rolling 7-day session count against `weekly_target` and the travel-day denominator reduction
(§9.3, floor of 2), week streak (§9.1), hard sets per muscle group over trailing 14 days (§14.3),
trailing volume for the §5.2 OVER-WORKED comparison, lifetime counters, and estimate accuracy
(§14.1.9).

## Done criteria

- [ ] Schema covers §4.3–§4.7 with migrations in place from commit one.
- [ ] A scripted **five-session run** mutates progression state, exercise state, rolled-up stats,
      and history correctly — with no network at any point.
- [ ] Force-quit mid-session resumes at the exact set, verified by test.
- [ ] Every §8.3 signal has a storage path and a test proving it is written.
- [ ] Only one pending session can exist; nothing enters history except via completion.
- [ ] Date helpers make `local_date` the path of least resistance; a test pins that flying east
      does not lose or duplicate a day.
- [ ] `npm run check` green; ADR written for the package-location decision.
