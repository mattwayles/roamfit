## Track: 11-vertical-push-l4-anchor — vertical_push.l4 is anchored on an exercise nobody trains
Last updated: 2026-09-02

### The problem
`vertical_push.l4` has `anchor_exercise_id: bw-dip`. `bw-dip` (Bench Dip) is
`anchor: body-support`, which is NOT in `DEFAULT_ANCHORS_AVAILABLE`, so it is hard-filtered away
for every user who has not ticked "Bench or step" on Generate. Its only sibling,
`banded-push-press`, is what actually gets programmed.

That is not merely cosmetic, because the anchor is the exercise the progression math runs on
(`exerciseForLevel`, `currentExercise` in `rules.ts`). The user trains a **band** movement while
their micro-state is seeded and advanced against a **bodyweight** one:

- `defaultMicroForExercise(bw-dip)` sets `micro.band = null`.
- `microAdvance` takes the bodyweight branch: reps → tempo → rest → sets. The band knob never
  moves, so the B2→B3 progression `banded-push-press` is authored for is unreachable.
- The tempo/rest/sets knobs that *do* move are not what is prescribed either — `prescribe.ts`
  is fine (it clamps to the sibling's own range), but the ladder the user is climbing is the
  wrong shape for the movement in front of them.
- The dashboard names the rung "Bench Dip" for users who will never be shown one.

### Done
- [x] Probe across all families for anchors that are not default-available (see gotchas) — analysis
      only, no commit.
- [x] `packages/engine/src/progression/micro.ts` — the band branch now tolerates
      `micro.band === null` by falling back to the exercise's lightest authored band, in
      `microAdvance`, `microRegress`, `isAtBottomMicroStep` and `reconcileMicroToObservedBand`.
      This is the migration guard: without it, an existing user already sitting at
      `vertical_push.l4` with a bodyweight-shaped `micro` (band `null`) would, the moment the anchor
      became a band exercise, skip the whole B2→B3 ladder on their next advance and drop a level
      early on a miss. — f28f0a9
- [x] `packages/data/library/families.json` — `vertical_push.l4.anchor_exercise_id` is now
      `banded-push-press`; `bw-dip` stays in `exercise_ids` as a sibling. Tripwire added to
      `packages/engine/src/progression/ladder.test.ts` (verified to fail on the old anchor before
      being committed green). — 906fb2a
- [x] `docs/BACKLOG.md` — the two rungs with the identical defect parked under Desired Fixes.

### In progress
- Nothing. The track is complete: `npm run check` and `npm run validate:library` both pass.

### Next
- Device verification is owed, as for every content change: no one has seen `vertical_push.l4`
  render as "Banded Push Press" on a real phone.
- The two remaining rungs in the tripwire's known-broken list, if wanted — deliberately out of
  scope here.

### Decisions / gotchas
- **`bw-dip`'s own `anchor: body-support` / `anchor_class: bodyweight_bearing` tagging is correct
  and is NOT being touched.** A bench dip genuinely needs a bench and genuinely bears bodyweight.
  `packages/engine/src/filters/lowBarAnchor.test.ts` is an explicit tripwire saying that anything on
  `body-support` or `pullup-bar` becoming default-available is a bug. The fix is to demote `bw-dip`
  from *ladder anchor* to *sibling*, not to loosen its safety gate.
- **Two other rungs have the exact same defect** — the anchor is hard-filtered away but a sibling
  covers the rung, so progression runs against an exercise nobody does:
  - `horizontal_push.l2` — anchor `bw-incline-push-up` (`body-support`), covered by `floor-press`.
  - `vertical_pull.l1` — anchor `bw-dead-hang` (`pullup-bar`), covered by `bw-low-bar-hang` /
    `banded-lat-pull-hold`.
  Deliberately out of scope for this track (the request named `vertical_push.l4`); parked in
  BACKLOG instead.
- **Rungs where NO sibling is default-available are a different thing and are fine as they are**:
  `horizontal_push.l7`, `vertical_pull.l6`–`l9`, `hinge.l7`, `lunge.l5`, `lunge.l6`. Those rungs
  are legitimately gear-gated end to end — there is no mismatch between anchor and programmed
  exercise, because nothing is programmed. Do not "fix" them by swapping anchors.
- Mixed band/bodyweight siblings at one level are normal and not a smell on their own. The defect
  is specifically: anchor filtered out **and** a sibling covers it **and** the equipment kind
  differs, so the micro ladder is the wrong shape.
- Invariant 5 is not at risk: `level_id` is unchanged, and no stored state names an exercise. No
  migration, no user's progression resets.
