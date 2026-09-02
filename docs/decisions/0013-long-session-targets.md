# ADR 0013 — 90- and 120-minute session targets

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §5.6's exercise-count table, which stops at "> 45 minutes → 8–10 main
exercises".

## Problem

The Generate screen gained 90- and 120-minute chips. Both produced **the same session as 60
minutes** — measured, on a cold-start full-body request:

| target | estimated | main exercises | deviation |
|---|---|---|---|
| 60 min | 57 min | 10 | — |
| 90 min | 57 min | 10 | `under / template_exhausted` |
| 120 min | 57 min | 10 | `under / template_exhausted` |

`mainExerciseCountRange` capped at 10 main exercises above 45 minutes, and `EXPANSION_HARD_CAP`
capped slot expansion at 14, so time-fit had nothing left to add. The §5.8 explanation line said
so honestly, but a chip that silently returns a session half the requested length is not a chip
worth shipping.

## Decision

Long sessions get their extra time **mostly from set volume, not exercise count.**

```
mainExerciseCountRange        longSessionSetsMultiplier
  <= 60   [8, 10]  unchanged    <= 60   1.0   (nothing below 60 changes at all)
  <= 90   [10, 14]  new         <= 90   1.5
   > 90   [12, 16]  new          > 90   2.0

EXPANSION_HARD_CAP  14 -> 18
```

`longSessionSetsMultiplier` feeds the existing `setsMultiplier` lever — the same one §9.4's
comeback cut uses, pulled in the opposite direction.

### Why volume rather than more exercises

A two-hour session is not a 30-minute session with four times the movements; it is the same
movements carried further. Filling 120 minutes by exercise count alone needs roughly 25
exercises, which is precisely what §5.6's count sanity check exists to prevent. Adding sets
instead keeps the session coherent, keeps the count inside a defensible range, and puts the extra
work on exercises the user's progression state actually tracks.

### Composition with the comeback cut

The two multipliers **compose** rather than override: `0.8 × 2.0 = 1.6`. A comeback session at a
120-minute target is still lighter per exercise than a normal one at that length, which is what
§9.4 is for. Note the composed effect is only visible **per exercise** — a lighter session leaves
budget spare, which time-fit backfills with more (still-lighter) exercises, so raw total set count
is not the right measure and the test asserts the per-exercise figure.

## Result

Every focus now lands inside the §5.6 ±10% band at both new targets, with no deviation reported:

| focus | 90 min | 120 min |
|---|---|---|
| full | 97 (+8%) | 130 (+8%) |
| upper | 96 (+7%) | 130 (+8%) |
| legs | 98 (+9%) | 131 (+9%) |
| abs | 97 (+8%) | 130 (+8%) |

The consistent small overshoot is pre-existing time-fit behaviour, not new — 30- and 45-minute
targets already land at about +7% — and the add-loop still strictly refuses to cross the +10%
ceiling, per §1.1's "overrunning is worse than falling short".

## Sessions of 60 minutes and below are untouched

`longSessionSetsMultiplier` returns exactly 1 below 60, `mainExerciseCountRange` is unchanged for
every existing tier, and `EXPANSION_HARD_CAP` only ever raises a ceiling that `min(maxSlots, cap)`
never reached at those lengths. The golden snapshots moved by exactly one line each — the
`engineVersion` string — confirming byte-identical output at 20, 30 and 45 minutes.

## Known, not fixed here

`upper` at 60 minutes lands at 53 minutes (−12%) and reports `template_exhausted`. This is
**pre-existing** — verified by re-running the measurement against the unmodified engine — and out
of scope for this ADR, which is about targets above 60. The upper template runs out of
non-laddered accessory patterns (`UPPER_ISOLATION` has only three) before the budget is full.

## Alternatives considered

- **Raise exercise counts only, no volume change.** 90 lands near 83 minutes (inside the band),
  but 120 still falls well short, so the 120 chip would stay half-broken.
- **Ship the chips with no engine change.** Honest, since the deviation is surfaced in the §5.8
  line, but the chips would not do what any user would expect them to.
