# ADR 0007 — A `low-bar` anchor, on by default, still bodyweight-bearing

**Status:** accepted · **Date:** 2026-09-01 · **Closes:** carried-forward issue #2

## Context

`bw-inverted-row` was tagged `anchor: pullup-bar`, which `anchor_class_for` maps to
`anchor_class: bodyweight_bearing`. That class gates **two separate things**:

1. **§5.3 availability** — `DEFAULT_ANCHORS_AVAILABLE` omits every bodyweight-bearing anchor, so
   the exercise is off until the user explicitly enables the anchor.
2. **§13.1 effort cap** — `effortCapForExercise` hard-caps any bodyweight-bearing exercise at
   `normal` (2+ reps in reserve, no AMRAP), regardless of the day's requested effort.

Carried-forward issue #2 argued this is too strict for an inverted row: it is partial-support, not
a full dynamic hang. The exercise's own setup cue agrees — *"Grip a waist-height bar — RV ladder
rung, picnic table edge, low branch... Walk the feet in to make it easier."*

The user reviewed both halves and decided (2026-09-01): **available by default, keep the effort
cap.**

## Decision

Add a new `Anchor` value, `low-bar`, and move `bw-inverted-row` onto it.

- `low-bar` maps to `anchor_class: bodyweight_bearing` — **the §13.1 effort cap is unchanged.**
- `low-bar` **is** included in `DEFAULT_ANCHORS_AVAILABLE` — availability is relaxed.
- `pullup-bar` and `body-support` are untouched and stay off by default.

## Why not the alternatives

- **Reclassify it as `band_tension`.** Rejected: it is `equipment: bodyweight`, `band: null`. The
  library validator correctly rejects the contradiction, and the data would be lying about the
  mechanics to buy a scheduling outcome.
- **Add `pullup-bar` to the defaults.** Rejected: that would also switch on real pull-ups,
  chin-ups, archer pull-ups and dead hangs, which is not what was asked for and is a genuine
  safety regression.
- **Exempt the exercise from the effort cap.** Rejected: explicitly not what the user chose, and
  §13.1 is a safety rule that should not be special-cased per exercise.
- **A fourth `anchor_class`.** Rejected as disproportionate: the class enum is consumed in several
  places and the availability question is really about the *anchor*, not the class. A new anchor
  is the smaller, more truthful change.

## Deviation from the spec, stated plainly

§5.3 says "all `band_tension` on, all `bodyweight_bearing` off" by default. This ADR carves out
**exactly one** exception. The carve-out is pinned by a test in
`packages/engine/src/filters/hardFilters.test.ts` that asserts the set of default-available
bodyweight-bearing anchors is exactly `['low-bar']`, so it cannot quietly widen. A second test
file, `packages/engine/src/filters/lowBarAnchor.test.ts`, pins that the effort cap still binds and
that no other exercise became default-available as a side effect.

## Consequences

- One exercise (`bw-inverted-row`) becomes reachable without settings changes. Golden snapshots
  changed **only** by gaining `"low-bar"` in the recorded `anchorsSnapshot` — no exercise
  selection changed in any pinned session, confirmed before the snapshots were updated.
- If a future exercise genuinely belongs on a waist-height bar, `low-bar` is the right anchor for
  it — but adding one widens a default-on safety carve-out and should be a deliberate decision,
  which the pinning test will force.
