# ADR 0010 — Sibling exercises per ladder level

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §6.6, which describes a progression family as an ordered list of levels
with **one exercise per level**, and `resolveSlot.ts`'s original note that "repeating the same
exercise while the user sits at a stable level is progressive overload working as intended."

## Problem

A 30-minute full-body session has six main slots. Five of them (`squat`, `hinge`,
`horizontal_push`/`vertical_push`, `horizontal_pull`/`vertical_pull`, `anti_extension`) are
laddered, so they bypass §5.2 selection entirely and resolve straight from
`ProgressionState.levelId`. One level held exactly one `exercise_id`, so those five exercises were
byte-identical every session until the user levelled up a family — for a cold-start user, forever
`goblet-squat, rdl, bw-knee-push-up, seated-row, bw-plank`.

The sixth slot is appended by `expandOptionalSlots`, which restarted its pattern cycle at index 0
every call, so it was always `elbow_flexion` — a curl, every single session.

The observed behaviour was correct per §6.6 and still wrong as a product: the user reported the
core group never changes. Progressive overload does not require the *same* exercise, only
consistent loading of the same pattern at the same difficulty.

## Decision

**A ladder level holds a set of exercises, not one.**

```jsonc
{
  "level_id": "hinge.l3",
  "anchor_exercise_id": "rdl",
  "exercise_ids": ["rdl", "glute-bridge", "frog-pump", "glute-kickback"]
}
```

- `exercise_ids` — every exercise that may be programmed at this level. Order is not meaningful.
- `anchor_exercise_id` — the one exercise whose properties drive **all** micro-progression math.
  Must be a member of `exercise_ids`.

`resolveLadderSlot` picks among the level's `exercise_ids` using the injected RNG, after hard
filters. Progression state is untouched by which sibling was picked.

### Why an anchor, rather than using the exercise actually performed

`microAdvance` / `microRegress` / `isAtBottomMicroStep` branch on `exercise.equipment` (band and
bodyweight climb different knobs), `exercise.metric` (10–12 reps vs a 20–45s hold), and
`exercise.band` (the B1–B5 range it ratchets through). If the micro math read whichever sibling
the RNG happened to pick, then *whether you can advance* would depend on the coin flip, and the
stored `micro` would mean something different from session to session. That is not a progression
ladder any more.

Pinning the math to the anchor keeps `ProgressionState` a property of the **level**, exactly as
§6.2/§6.3 intend, and makes sibling choice a purely cosmetic-at-the-margin decision.

### Compatibility rules between siblings (enforced in `validate.ts`)

1. **Same `metric`.** A reps prescription and a hold prescription are different shapes on screen
   and in `SessionEntry`; a level cannot be both.
2. **Same `pattern`** as the family, and **`role: main`** — already required of ladder rungs.
3. **Band ranges may differ.** `micro.band` is clamped into the chosen sibling's own
   `parseBandRange` window at prescription time. Without the clamp a `micro.band` of `B3`, legal
   for the `rdl` anchor (B3–B4), would be prescribed against `glute-kickback` (B1–B2) — a band
   that exercise is not authored for.
4. **Equipment may differ.** A bodyweight sibling at a band anchor's level simply has no band; the
   §5.2 band-ratio aggregate already tolerates this, and the hard filter still applies.

Rules 3 and 4 are what make the existing library usable at all: requiring identical band ranges
would have left almost every level with no eligible sibling.

## Why this does not violate invariant 5

Invariant 5 is *"`level_id` is a stable identifier, never an array index."* Nothing here changes
that. `level_id` is still the only thing persisted in `ProgressionState`, still assigned once,
still looked up by id. Adding exercises **inside** a level does not renumber, reorder, or reuse a
single `level_id`, and no stored state names an exercise — so an existing user's progression
survives this change untouched, with no migration.

## Accessory cycle offset

`expandOptionalSlots` now derives its starting offset from session history instead of hardcoding
`i = 0`. The appended accessory slots therefore rotate through the focus's accessory patterns
across sessions rather than always leading with `elbow_flexion`.

This is a rotation, not an RNG draw: it is history-derived and deterministic, matching how
`alternate()` already rotates `upper_push` / `upper_pull` / `core` in `fullSlots`, and keeping the
engine's "no ambient randomness" property intact.

## Consequences

- `families.json` grows an `exercise_ids` array per level; `exercise_id` is renamed to
  `anchor_exercise_id`. The rename is deliberate — it makes every existing call site a compile
  error until someone decides whether it wanted the anchor or the whole set.
- `ENGINE_VERSION` is bumped and the golden snapshots are regenerated: the same seed and state now
  legitimately produce different exercises.
- Some exercises that previously had `progression_family: null` gain a family and level id, since
  a sibling is a ladder member. `validate.ts`'s bidirectional check covers this.
- `vertical_push` and `vertical_pull` had **zero** unused `tier: core` exercises in the library,
  and `squat` had none at the calibration-start level. New exercises were authored to fill those
  gaps rather than promoting `tier: fill` conditioning moves (burpees, wall sits, jumping jacks)
  into strength ladders, which would have changed what those slots mean.

## Alternatives considered

- **Strict siblings — identical metric, equipment and band range.** No clamping needed anywhere.
  Rejected: it ruled out nearly every pairing the current library could support (`rdl` at B3–B4
  could not sit beside `glute-bridge` at B2–B3), so it would have delivered almost no variety.
- **Let the RNG pick the sibling and run micro math on it.** Rejected above — it makes
  progression depend on the draw.
- **Randomise the accessory offset instead of rotating it.** Rejected: `expandOptionalSlots` runs
  before the RNG is threaded into template building, and a rotation gives *better* coverage
  anyway — a draw can repeat the same pattern three sessions running.
- **Leave the ladders alone and widen the jitter in `selectMain`.** Rejected: the jitter only
  affects accessory slots, which were never the problem. Five of six main slots never reach it.
