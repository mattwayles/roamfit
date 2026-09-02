# ADR 0011 — Abandoned sessions rotate the template

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §5.2's "discarded sessions never happened", as applied to template
rotation and exercise recency. Extends ADR 0010.

## Problem

`generate → abandon → generate` handed back a workout with the same shape as the one just walked
away from. Every rotation in the generator keyed off "the most recent **non-discarded** session",
so abandoning left the generator's idea of where it was in its rotations completely unmoved.

That is the wrong behaviour at the exact moment it matters most. Abandoning is the strongest
negative signal the product has — the user looked at this session and quit — and the generator
answered it by offering the same template again.

## Decision

Split "recency" into two questions, which §5.2 had collapsed into one:

| | Question | Counts discarded sessions? |
|---|---|---|
| **Seen** | What did the generator last *show* me? | **Yes** |
| **Trained** | What did my body actually *do*? | No |

Anything shaping what the next session looks like is a **seen** question. Anything about load,
fatigue, or progress is a **trained** question, and abandoning must remain invisible to it — you
did not do the work, so nothing may behave as if you did.

### Now counting discarded sessions (seen)

- `lastChosenPattern` → `alternate()`, which rotates `full.lower_knee` (squat ↔ lunge),
  `full.upper_push`, `full.upper_pull`, `full.core`, `upper.vertical`, `upper.isolation`, and the
  abs lead pattern.
- `accessoryRotationOffset` → which accessory pattern the appended slot leads with (ADR 0010).
- `recentExerciseIds` → the sibling a ladder level avoids re-programming (ADR 0010).

### Deliberately unchanged (trained)

- `sessionsAgo` / `recencyTier` — §5.2 BLOCKED and soft cooldown. Deliberate: an abandoned
  workout should not *block* its exercises from the next two sessions. The user may well have
  quit for reasons that had nothing to do with the exercises, and on a thin pool a spurious block
  is how a PATTERN GAP gets manufactured.
- `overWorkedMuscles` / `recentHardMuscles` — §5.2 volume caps and the 48h recovery window.
  Muscles you did not train are not fatigued. Counting abandoned sessions here would suppress
  work the user actually needs, and the 48h rule is the one with a safety rationale behind it.
- `assessComeback`, `hasEverCompletedSession`, `lastLevelChangeAt` comparisons, and every
  progression transition in `rules.ts` / `calibration.ts`. Abandoning must never advance, regress,
  or freeze a ladder.
- The §14 dashboard, streak-free weekly dots, and the passport. Abandoning is not a training day
  and must not be displayed as one (invariant 4 — never punish, and equally never fake credit).

## Consequences

- `generate → abandon → generate` now returns a genuinely different template, not merely a
  different draw from the same one.
- Repeated abandoning walks the rotations forward. A user who abandons three full-body sessions
  gets squat, then lunge, then squat again, with the accessory slot moving each time. That is the
  intended behaviour: keep offering something different until something sticks.
- `SessionHistoryRecord.status` is now load-bearing in both directions, so the helpers are named
  for which question they answer (`lastSeenSession`, `lastTrainedSession`) rather than taking a
  boolean.

## Why not go further

Making `sessionsAgo` count discarded sessions was considered and rejected above. It is the one
remaining place where an abandoned session is invisible to *variety* rather than to *load*, and
it could be revisited — but it turns abandonment into a two-session ban on those exercises, which
is a punishment mechanic in a product whose fourth invariant is "never punish".

## Alternatives considered

- **Rotate on abandonment only, as a special case at the call site.** Rejected: it puts the rule
  in the screen that handles the abandon button rather than in the engine, so it would not apply
  to a session abandoned by any other route, and it is untestable in the pure engine.
- **Treat an abandoned session as completed for all purposes.** Rejected outright — it would
  advance progression and register fatigue for work nobody did, which is a correctness bug, not
  a variety trade-off.
