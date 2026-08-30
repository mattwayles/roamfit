# Wave 4 — The core workout loop (UI)

**Track id:** `4-loop` · **Status file:** `docs/handoff/STATUS-4-loop.md`
**Spec sections to read:** §10.1–§10.10, §8.1, §8.2, §5.3, §1.1. Do not read the whole spec.

The first wave with screens. The engine (Wave 2) and store (Wave 3) are already verified, so
**this wave writes no business logic** — if you find yourself computing a prescription, choosing
an exercise, or deciding a progression here, you are in the wrong layer. Call the engine.

## Goal

A user can generate, approve, run, and complete a real workout on the simulator, entirely
offline, and the resulting data is correct in the store.

## Screens

| § | Screen | Notes |
|---|---|---|
| 10.1 | **Home** | Action above analytics. Today card → Quick Session → this week → Next Unlock. A resumable pending session replaces the Today card. |
| 10.2 | **Generate** | Pickers arrive **pre-filled with the recommendation and the reason inline** — smart generation is the default, not a button. Order: Time, Anchors, Focus, Effort. |
| 10.3 | **Plan approval** | The §5.8 explanation line at top. Add/remove/swap, edit sets and rep targets, live time estimate, Regenerate, "Regenerate with a note". |
| 10.4 | **Active — reps** | Strict hierarchy. Hero = name, target reps, `Set 2 of 3`, nothing else at that size. |
| 10.5 | **Active — timed** | Large circular timer, tap-to-start with 3s "get ready", End early records **actual seconds held**. Unilateral runs two sequential timers. |
| 10.7 | **Rest timer** | Auto-starts. `+15s`/`−15s`/`Skip`. Next-up preview. **The only place the two feedback controls appear.** |
| 10.9 | **Summary** | Per-set actuals, optional retrospective, level-up celebration full-screen before anything else, FINISH. |

### Hard UI rules from the spec

- **§10.4 hierarchy is a requirement, not a suggestion.** The original spec's ~13-region screen
  was explicitly rejected. Body focus, movement pattern, and intrinsic difficulty do **not** appear
  — they are engine metadata. Demo media never exceeds ~⅓ of the screen and never displaces the
  hero.
- **Skip and Remove are different and both are kept** (§10.4). Skip = didn't do it, keep the
  record (a signal). Remove = change the plan. Never conflate them.
- **Demo media and "How to" auto-expand only on the user's first-ever performance** of that
  exercise; collapsed thereafter.
- **Pinned note** (§8.2) — yellow sticky, always visible when present, editable inline, persists
  instantly, obviously editable.
- **Feedback (§8.1) is exactly two optional controls** on the rest screen: a 3-position difficulty
  segment and a five-emoji row. Unset difficulty means "just right"; unset enjoyment is neutral.
  Never required, never blocking, never nagged, never solicited twice. Tapping the same emoji
  clears it.
- **Quick Session** (§9.5) is a permanent home-screen button equal in prominence to the main CTA.
  One tap straight into the session — no pickers, no approval page.
- **No sub-15-minute option in the duration picker** — ADR 0002. Quick Session is the short path.
- **Mid-workout swap** (§10.6): 3–5 alternatives, same pattern slot, same progression level, all
  filters respected, one further tap to continue. No re-approval, no regeneration, session timer
  never interrupted. Include the "different anchor" quick-filter.

## Device behavior (§10.8) — non-negotiable

The phone is on the floor. Keep-awake for the whole session, released on completion or
abandonment. Large thumb-reachable targets, legible at arm's length. Audio **ducks** over music
rather than interrupting; cues respect the silent switch with a user override; haptics carry the
same information when muted. **Timers are wall-clock based, not tick-based** — backgrounding,
locking, and suspension must never drift the count. Rest timer works with the screen locked or
the app backgrounded (background audio session + a local notification at zero).

Crash safety is Wave 3's storage guarantee, but this wave must actually **use** it: persist per
set, and resume exactly where it left off after a force-quit.

## Architecture

- Screens call the engine and the store. **No business logic in components.**
- Pick navigation and state libraries now and record them in the status file with a one-line
  rationale each. Prefer boring and well-supported.
- Carried-forward issue #6: `@testing-library/react-native`'s `render()` returned an empty object
  under this stack in Wave 1, so `react-test-renderer` was used instead. Retry RNTL first — you
  need real queries for interaction tests. If it still fails, record what you tried.

## Testing

Component/interaction tests for the pieces where being wrong is expensive: the timed-exercise
timer (drift, background, end-early recording), the rest timer, per-set persistence and resume,
the swap flow, and the feedback controls' unset semantics. **A wall-clock timer test must
actually simulate suspension**, not just advance a fake tick.

## Done criteria

- [ ] Generate → approve → run → complete works end to end on the simulator **in airplane mode**.
- [ ] Timed exercises, rest timer, and mid-workout swap all work, with audio and haptics.
- [ ] Force-quit mid-workout resumes at the exact set.
- [ ] Timers do not drift across backgrounding — verified, not assumed.
- [ ] Completed session data in the store is correct: actuals, signals, progression updates.
- [ ] `npm run check` green; no engine or store logic reimplemented in the UI layer.
- [ ] Screenshots or a recorded run attached to the status file as evidence the loop works.
