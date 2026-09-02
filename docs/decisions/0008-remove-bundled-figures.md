# ADR 0008 — Remove the bundled stick-figure demo drawings

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §11.4 (tier 2, "In-house line-art figures — v1, bundled, every exercise"),
and the tier-2 references in §10.4 and §11.2.

## Decision

Delete the bundled in-house line-art figures and everything that produced or served them. The
media ladder becomes two tiers, not three:

1. **Curated YouTube embed** — online, unmetered, not locally demoted, curated id present.
2. **YouTube search link** — online; shown alongside tier 1 or on its own.

With neither available — offline, metered, or demoted with no id — the resolved tier is
`cues_only`. No media frame renders at all, and the exercise's `setup` cue (the "How to" block)
is the demonstration.

## Why

The figures were the offline answer to "show me what this movement looks like." In practice the
`setup` cue already carries that load: it is authored per exercise, it is the thing §11.4 itself
calls *"the authoritative cue"*, and it describes the anchored long-loop setup in words that a
generated drawing can only approximate. A stick figure that is merely *adequate* next to a precise
cue is not worth the surface area it costs — 420 KB of generated SVG in the bundle, a generator
script, a validator coverage gate, ~290 lines of geometry assertions in `packages/data`, and a
native SVG renderer on the workout screen's hot path.

The generated figures also never fully escaped the quality problem their own test suite documents:
`index.test.ts` carried regression guards for pose duplication, floor-line grounding, off-canvas
geometry, and limb coloring, each added after a round of wrong drawings. That is a lot of
machinery to keep a drawing from being actively misleading, and a subtly wrong form demonstration
is the same class of safety problem §11.4 cites when it rejects AI-generated exercise *video*.

## What this costs, stated plainly

Offline users lose the visual demo. They keep the cue text, the exercise name, the band and anchor
spec, and the full workout loop. **Invariant 1 (offline is not a degradation mode) still holds in
the sense that matters** — generate, approve, run, complete, log, and dashboard all work with zero
connectivity, which is what §11.6's airplane-mode gate actually tests — but it is honest to say
offline demo *richness* is reduced. The user made this call explicitly, weighing it against the
cue text being sufficient.

Consequence to watch: §15's `demo_media_expanded` signal now only ever fires when there was real
media to expand. `DemoMedia` returns `null` rather than firing `onExpand` on an empty frame, so
the metric that decides which exercises get self-filmed loops (§11.4 tier 3, post-launch) stays
meaningful instead of being diluted by offline opens.

## Changes

- Deleted `packages/data/library/figures.json`, `tools/generate-figures.ts`, and
  `app/__mocks__/react-native-svg.js`.
- Removed `figureLibrary` from `@roamfit/data` and `figures` from `StoreContext`.
- Removed the `demo_media` field from the `Exercise` schema and from all 204 library records, plus
  its validator check and the figures coverage/budget gate.
- **Added** a validator check that `setup` is present and non-trivial on every record. It was
  previously unchecked; now that it is the sole offline guidance, a blank cue is an offline-gate
  failure rather than a content nit.
- `MediaTier` `'figure'` → `'cues_only'`; `DemoMedia` renders `null` when it has nothing to show.

## Not done here

`react-native-svg` is now unused but is left in `app/package.json`. Removing a native module
requires a pod reinstall and a dev-client rebuild, which is a separate, independently verifiable
step rather than something to bundle into a content change.

## Alternatives considered

- **Keep figures, fix quality.** Rejected: the cost is recurring (every new exercise needs a
  reviewed drawing) and the ceiling is still "worse than the cue."
- **Keep the schema field, drop the assets.** Rejected: a `demo_media` pointer to nothing is worse
  than no field — it invites a future agent to "restore" the missing files.
