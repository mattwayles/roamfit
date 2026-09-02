# ADR 0012 — Level-1 cold start, and a user-driven "too easy" level-up

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §6.5, "every family starts at roughly the 30th percentile of its ladder."

## Problem

§6.5 seeded every family partway up its ladder — `horizontal_push.l3` (knee push-ups),
`squat.l3` (goblet squat), and so on. That is a guess about a user the product has never seen,
presented to them as their level. It also defeats the point of a ladder: you are placed on a rung
by arithmetic rather than arriving at it.

But every user is different, and starting everyone at the bottom is only workable if there is a
fast way up. There was not:

- §6.5 calibration runs for `CALIBRATION_SESSIONS` (3) sessions and can jump at most one level
  each, so it can climb three rungs, ever. `horizontal_push` is nine deep.
- Outside calibration, `rules.ts` has no level jump at all. `too_easy` feedback fed the enjoyment
  EMA and nothing else; a level change required exhausting the whole micro-progression sequence
  (reps → tempo → rest → sets), which is many sessions per rung.
- All of it applied at session completion, so the only way to escape wall push-ups was to do a
  full session of wall push-ups first.

## Decision

**1. Cold start is level 1.** `calibrationStartLevel` returns `family.levels[0]`.
`CALIBRATION_START_PERCENTILE` is deleted rather than set to `0`, so nothing reintroduces a
"start them partway up" seed without reading this file.

**2. `levelUpForTooEasy`** — a new transition in `rules.ts`, structurally unlike every other one
there. The rest are *inferred* from logged performance at completion; this is a direct
instruction, so it applies the moment it is given and is repeatable, one rung per call. A user who
belongs five rungs up taps five times and sees each exercise on the way.

The new level's micro-state resets to that level's default, exactly as an earned `level_up` does.
Streaks reset too — they described progress toward a transition at the level just left. The
`calibrating` flag is *preserved*: a user fixing their starting rung by hand is precisely what
calibration is for, and ending it early would strand them if they overshoot.

**3. `levelUpEntry`** (store) advances the family and rewrites the session entry in place, so the
change is visible in the plan the user is looking at rather than deferred to next session.

**4. The control appears at approval and mid-workout**, on laddered entries only. Those are the
two moments you notice: reviewing the plan, and discovering set 1 is trivial.

## This is not a swap

§10.6's swap says *"not this exercise, give me a different one at the same difficulty"* and counts
`swapAwayCount` against it, which feeds the §5.2 REPEATEDLY-SKIPPED suppression. A level-up says
*"this rung is below me."* The outgrown exercise gets **no penalty** — the user has no complaint
about it, and suppressing it would be wrong when they may well meet it again on a deload or a
comeback. There is a test for this.

## Safety and correctness

- **A rung the user cannot perform is a no-op.** `levelUpEntry` resolves the new level against
  the user's real hard filters *before* committing the level change, and rejects a resolution
  that walked back down (`no_eligible_exercise`). Advancing someone onto a rung they cannot do
  would strand them there; silently handing back a lower rung would look like the button did
  nothing, or like it moved them backwards.
- **Invariant 2 holds.** Every number written comes from the engine — `levelUpForTooEasy`,
  `resolveLadderSlot`, `prescribeLaddered`. The store and the screens decide nothing about
  training; the screens only choose what to say about the outcome.
- **Invariant 4 holds.** The notice is one informational line, replaced rather than stacked. There
  is no nagging, no "are you sure", and reaching the top of a ladder reads as an achievement
  ("That's the top of this ladder — nice"), not an error.
- **`level_up_too_easy` is logged as a signal** with both rungs. This is the highest-signal
  correction the product gets about a wrong starting level, and the natural feed for tuning the
  cold start later with real data instead of a percentile.

## Two library problems this exposed

Starting at level 1 put every user on rungs nobody had been placed on before, and two of them
were broken:

- **`vertical_pull.l1` needed a bar.** Both its exercises (`bw-dead-hang` on `pullup-bar`,
  `bw-low-bar-hang` on `low-bar`) are bar-anchored, so a user with neither anchor got a permanent
  PATTERN GAP on vertical pull — `resolveLadderSlot` can only walk *down*, and there is nothing
  below l1. Added `banded-lat-pull-hold`, timed to match the rung's dead-hang anchor per ADR
  0010's metric rule.
- **`pipeline.test` asserted no `bodyweight_bearing` entry ever appears for a default user.** That
  was never the rule — ADR 0007 put `low-bar` in `DEFAULT_ANCHORS_AVAILABLE` *precisely* so
  bar-supported work could be programmed. It held only because nobody was ever seeded at a level
  where such an exercise sat. It now pins the real rule: a bearing exercise must use an anchor the
  user has, and must have had the §13.1 effort cap applied.

## Migration

`0009_reset_progression_to_level_1.sql` deletes every `progression_state` row rather than
UPDATE-ing to a literal level id — SQL has no knowledge of the ladders, and hardcoding
`"<family>.l1"` would duplicate ladder structure into a migration where it could drift from
`families.json`. `ensureProgressionStatesInitialized` re-seeds from the engine on the next
generation, so the migration cannot encode a wrong starting level even if the ladders change.

`exercise_state` is deliberately untouched: enjoyment EMAs, skip/swap counts, best sets and
user-assigned videos are all still true, and none of them describe a ladder position.

## Alternatives considered

- **A level picker per family.** Faster for an advanced user, but it is a screen to design and it
  invites picking a level you cannot actually do. One rung per tap is self-limiting — you see
  every rung you skip.
- **Widen `CALIBRATION_SESSIONS` and lean on automatic overshoot detection.** Still caps at one
  rung per completed session, so an advanced user grinds several trivial sessions before the
  program is honest. Worth revisiting as a *complement* once there is `level_up_too_easy` data.
- **Keep the percentile start and add the control anyway.** Rejected by the user, and rightly:
  it keeps the guess, and a guess that is too *high* is the more damaging error — it hands a
  beginner an exercise they cannot safely do.

---

## Amendment, 2026-09-01 — the control lives on the progression board

Decision 4 above ("the control appears at approval and mid-workout") is **superseded**. Both of
those buttons are removed. The control now lives on one §14.1.4 progression board row per family.

Approval was replaced by a Swap control first, which left the level-up mid-workout only — and that
put back exactly the friction this ADR existed to remove, since an already-trained user could no
longer correct a too-low rung without first starting a session of wall push-ups. The board is the
resolution, and is a better home than either original placement:

- **A ladder position is a property of the user, not of a session.** Editing it from inside a
  planned or running workout was always a category error; it only looked natural because that is
  where the exercise happened to be on screen.
- **The board is the one surface that already shows the rung** — "Level 3 of 9 — Knee Push-Up".
  The control now sits directly under the thing it changes.
- **It needs no session to exist.** Correcting your starting rungs is a thing you do *before*
  generating anything, which is what an already-trained user hitting a level-1 cold start actually
  wants to do.
- **It scales.** All eight families are adjustable in one screen, rather than only whichever ones
  today's session happened to include.

### What changed in code

`levelUpEntry` (advance the family *and* rewrite a session entry) is replaced by `levelUpFamily`
(advance the family, full stop). Everything else is unchanged: `levelUpForTooEasy`, the
pre-commit hard-filter check that refuses to strand a user on an unusable rung, the
`level_up_too_easy` signal, and the repeatable one-rung-per-tap behaviour.

The signal now carries no `sessionId` (there is no session), and no `entryId`/`fromExerciseId`.
It still carries `familyId` and both level ids, which is what makes it useful for tuning the cold
start later.

### Consequence

Nothing is offered on a mastered family — §6.7 Mastery is the top of the ladder, and there is no
rung above it to move to.

### Confirmation step

Tapping "Too easy — level up" opens an inline two-step confirm before anything is written, the
same shape `AbandonSessionButton` uses. This is not ceremony: `levelUpForTooEasy` resets the
level's micro-progression to the new rung's floor, and there is **no "level down" control** — the
only route back is §6.3's drop-a-level, which costs two failed sessions. An accidental tap would
therefore be expensive and awkward to undo, which is exactly the class of action CLAUDE.md's
"confirm before destroying" rule covers.

The copy says what is actually at stake ("the next rung is harder, and your progress toward this
unlock starts over") without naming the exercise being unlocked (ADR 0014) and without any
discouraging framing (invariant 4). The confirm is row-scoped — only the family you tapped enters
that state — and is cleared on refocus, so returning to Home never greets you with a stale prompt.
