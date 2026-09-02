# ADR 0014 — An unlock is a reveal, not a countdown to a known thing

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §14.1.3 / §6.4, whose Next Unlock example is literally
*"Push-ups: 2 sessions from archer push-ups"* — a line that names the exercise being unlocked.

## Decision

**Nothing names the next exercise before it is earned.** The progression board, the Next Unlock
hero, and the §9.8 daily nudge notification all say how *close* the unlock is and what you are
working on now, never what is coming.

`celebration.ts` still names the new exercise at the moment it is unlocked. That is the payoff,
and it is the one place the information belongs.

## Why

Naming it in advance spends the reward for nothing. "6 sessions from Incline Push-Up" turns an
unlock into an appointment: you already know the ending, so arriving at it is administrative
rather than exciting. "6 sessions to your next unlock" keeps the same honest, monotonic promise
§14 asks for — a count that only goes down, never a date — while leaving something to find out.

This costs nothing in information the user needs. Which rung you are on, what you are doing now,
and how far to the next one are all still on screen, and are in fact now much more prominent.

## Three places leaked it, not one

The board was the reported problem, but hiding it there alone would have been theatre:

1. **The board row** — "6 sessions from Incline Push-Up".
2. **The Next Unlock hero**, two rows above the board on the same screen — same sentence.
3. **The §9.8 daily nudge notification** — `"2 sessions from archer push-ups."` This is the worst
   of the three: a lock-screen preview spoils the unlock for someone who never opened the app to
   look.

`FamilyBoardEntry.nextExerciseName` and `NextUnlockHero.nextExerciseName` are both deleted rather
than left unread, so a future surface cannot casually reintroduce the leak.

## The board redesign that came with it

Removing the reveal left room to answer the question the board is actually for — *how close am
I?* — properly:

- Two columns. Identity (family, current exercise) on the left; status on the right.
- The sessions-remaining count sits directly under the "Level X of Y" chip, right-aligned, at
  34pt — so the whole right edge reads as one answer to "where am I, and how close am I".
- A progress bar across the card shows position *within* the level.

The bar's denominator is `sessionsInLevel`, computed by running the engine's own
`microStepsToNextLevel` from the level's default micro-state. Both numbers therefore come from
the same simulation, so the bar can never disagree with the figure beside it.

## Consequences

- §14.1.3's spec example no longer matches the shipped copy. The requirement it encodes — one
  concrete, close, honest reason to come back tomorrow — is met; the specific wording is not.
- A mastered family shows the Mastery badge and its micro-progression line, with no count, no bar
  and no level-up control. There is nothing above the top of a ladder.
- `HomeScreen.levelUp.test.tsx` pins the rule directly: whatever rung the board is on, no exercise
  from the rung above may appear in the row *or* in the hero.

## Alternatives considered

- **Hide it on the board only, as literally asked.** Rejected: the hero sits two rows above the
  board on the same screen and said the same thing, so the change would have achieved nothing.
  Extending it to the hero and the notification is what makes the requested change actually work,
  and both are trivially reversible if the wider scope is unwanted.
- **A silhouette or "???" placeholder for the next exercise.** Rejected as a worse version of
  telling them — it advertises that something is being withheld, which invites the user to go
  looking rather than letting the unlock arrive on its own.
