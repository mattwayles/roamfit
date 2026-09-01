## Track: 6a-figures — In-house line-art demo figures
Last updated: 2026-08-31 (second rework round closed — see "Round 2" below)

### Status
Done, pending final orchestrator sign-off. `npm run check` and `npm run validate:library` both
green. 200/200 exercises have a bundled figure; 135/200 distinct geometries (up from 57 at the
first pass, 130 at the start of this round); every orchestrator finding from both review rounds
is addressed — see "Round 1" and "Round 2" below for exactly what and how it was verified.

### Round 1 — orchestrator findings and fixes (`f927f2c`)

Orchestrator verification of the initial commit (`6ec3b00`) confirmed all mechanical claims
(200/200 coverage, 0 orphans, 342 KB of a 3 MB budget, 0 video-id references) but rasterized the
SVGs with `qlmanage -t` and found the art itself illegible or wrong. Six findings:

| # | Finding | Fix |
|---|---|---|
| 1 | 200 figures were only 57 distinct geometries | Archetype table + overrides expanded; reached 130 by the end of round 1, 135 by the end of round 2 (see Round 2's table below) |
| 2 | `cd-chest-stretch` (a stretch) rendered as a push-up — semantically wrong archetype | Dedicated stretch/mobility archetypes added for the whole `cd-*`/`wu-*` set, checked against each `setup` cue |
| 3 | Superimposed start/end poses were an unreadable tangle | Rewrote the layout as two side-by-side panels (start \| end) with a divider and a movement arrow between them, instead of one pose drawn ghosted under the other |
| 4 | Isometric holds drew two poses plus a movement arrow | `metric === 'time'` now renders one pose plus a pause glyph, no arrow, no divider |
| 5 | Band read as a small stray mark, not a legible path from an anchor | Anchor glyph + band path drawing rewritten (see Round 2, which found and fixed the remaining half of this) |
| 6 | Arms and legs indistinguishable | Trunk/arm/leg given distinct colors (`#1e293b` trunk, `#0891b2` arm, `#7c3aed` leg) |

The agent addressed all six and wrote regression tests, then was paused by the user mid-increment
before committing. The orchestrator ran `npm run check` (green) and committed the work as
`f927f2c` so it would not be lost, then resumed the track for a second round.

### Round 2 — orchestrator re-review findings and fixes (this session)

The orchestrator rasterized at 640px and confirmed findings 3, 4, and 6 were genuinely fixed, and
accepted the remaining 4-5-exercise geometry clusters (glute-bridge family, curl family, deadlift
family) as genuinely similar movements. Two defects were still open, both found by rendering:

1. **`bw-plank` (and every plank/side-plank hold) floated above the ground line, hand/foot
   nowhere near the floor.** Root cause, confirmed by printing joint coordinates rather than
   guessing: the hold-rendering path always uses `poseB` alone, but `poseB`'s `hipOffset` had
   been tuned as a *relative* lift on top of `poseA`'s own offset (a two-panel-only assumption).
   Isolated as a single pose, `poseB` alone didn't reach the ground. **Not** a divergent
   ground-contact code path between hold and dynamic rendering, as the orchestrator's hypothesis
   suggested — there was no ground-contact logic in either path; the fix was recomputing each
   affected archetype's angles/offset so its `poseB` reaches the ground on its own. Fixed for
   `anti_extension`, `side_plank_hold`, `side_plank_dynamic`, `kneeling_fold`, `half_kneeling`,
   `squat_to_plank` — every archetype whose hold or plank-family pose is meant to touch the
   floor. Verified by computing hand/foot y against the y=152 ground line for each (within ~5px
   in every case) before re-rendering, then re-rendering and looking. New jest test
   (`rests a plank-family hold on the ground line`) regex-extracts the hand/foot marker's `cy`
   from five plank/side-plank hold ids and asserts it lands within 15px of the ground line.
2. **Finding 5 was only half-fixed: `banded-squat`'s band was a short mark, not a legible
   path.** Root cause: the fixed-anchor point for `stance`/`feet` anchors was tied to the
   *working joint's own x* in several archetypes (squat, lunge, calf) whose band is anchored
   under the feet but held in the *hands* — when the working joint was itself the foot, anchor
   and working point collapsed to nearly the same spot. Fixed by (a) decoupling the anchor x from
   the working joint (now fixed to the hip's x) and (b) auditing every archetype's `bandJoint`
   against its exercises' actual `setup` cues — squat, lunge, calf, hip_extension, jump_squat,
   lateral_lunge_shape, elevated_front_step, and elevated_rear_foot's `bandJoint` were all wrong
   (mostly `'foot'` where the cue says the hands hold the band). New jest test asserts every
   `anchor-low/mid/high` post glyph's x is within the canvas (a related bug — see next item —
   made this concrete).
3. **Also found while fixing #2, not part of either finding list: the `anchor-low`/`anchor-mid`/
   `anchor-high` post glyph used a single hardcoded (and negative) canvas x meant only for the
   left panel.** On the right panel it drew off-canvas, and the band became one long stray line
   spanning the entire width, straight through the divider — this is what actually produced the
   worst version of Finding 5's "small stray mark" complaint (`band-sit-up` was the clearest
   example). Fixed by passing each panel's own x-origin into the anchor-point calculation. New
   jest test (`draws a fixed-anchor glyph ... within each panel it belongs to`) asserts every
   anchor post's x is within `0..300` (the full canvas) for every `anchor-low/mid/high` exercise.
4. **Squat depth exaggerated further** — `banded-squat`'s depth read as barely a squat at
   thumbnail size; hip/knee angles and the hip-drop offset pushed further so the two panels are
   unambiguously "standing" vs. "deep squat."

### Full pixel-level review this round (not just the reported bugs)

Per the instruction to widen review to one figure per geometry cluster (not one per pattern): all
**135 geometry-cluster representatives** were rendered with `qlmanage -t` and read individually
(not just via a crowded composite — an early attempt at a 4×5 grid contact sheet produced enough
false positives from crowding/small scale that it was abandoned in favor of one full-size
thumbnail per exercise). This pass, on top of the two orchestrator-reported bugs, found and fixed
**eleven more real archetype-assignment bugs** the same way `cd-chest-stretch` was found in round
1 — by checking a rendered figure's body position against its `setup` cue:

- `bw-fire-hydrant` (quadruped: "on hands and knees") was rendering the pattern's standing default
- `bw-inverted-row` ("hang underneath with a straight body") was rendering standing
- `bw-knee-push-up` was reusing a sit-back kneeling fold, not a shortened plank
- `plank-row`, `plank-band-drag`, `bw-plank-shoulder-tap`, `bw-plank-up-down` (all explicitly
  "High plank...") were rendering `anti_rotation`'s standing default
- `russian-twist`, `bw-russian-twist` ("Sit leaned back... feet hovering") were rendering standing
- `bw-windshield-wiper` ("On your back") was rendering standing
- `clamshell` ("Side-lying") was rendering the `abduction` pattern's standing default
- `lateral-walk`/`monster-walk`/`wu-lateral-walk` (correctly standing) had their band loop glyph
  at the ankle when the cue says "around thighs, just above the knees"
- `chest-fly`, `high-low-fly`, `low-high-fly` ("Anchor ... behind you," a standing fly) were
  rendering `horizontal_push`'s plank default
- `floor-pullover` ("Lie on your back") was rendering `vertical_pull`'s standing default
- `bw-prone-ytw` ("Face down") was rendering `shoulder_isolation`'s standing default

Each got a purpose-built or reused archetype (`inverted_row`, `knee_push_up`, `plank_reach`,
`seated_twist`, `side_lying_abduction`, `abduction_thigh`, `standing_fly`, `supine_pullover`) —
see `tools/generate-figures.ts`'s `SHAPES`/`REUSE_ARCHETYPE` for the full list and the comment on
each entry explaining why. All were re-rendered and re-inspected after the fix.

**What I looked at and what I saw, honestly:**
- All 135 cluster representatives, individually, at 340-500px. Every one now shows a body
  position that is at least plausible for its `setup` cue; the eleven bugs above are the ones
  that were outright wrong (a different exercise's shape entirely), not stylistic quibbles.
- A representative sample of exercises *within* clusters I didn't individually render (the
  ~65 exercises that share a geometry with another already-reviewed exercise) — spot-checked
  their `setup` cues against the archetype/override reasoning in code comments, not by rendering
  each one's pixels. This is the same "coverage vs. individual pixel review" distinction round 1
  drew, now at a much finer grain (135/200 individually rendered and inspected vs. 37/200 in
  round 1).
- Two montage/contact-sheet attempts were unreliable at high density (I misread "no ground line
  visible" and "a stray pause icon" on exercises that, checked directly, had neither problem) —
  documented here so a future session doesn't repeat that specific mistake. Individual full-size
  thumbnails, or direct string/regex checks on the SVG markup, were the reliable methods.

### Known, accepted limitations (documented, not silently left)

- **This rig is a single, sagittal (side-view) silhouette.** It cannot show: bilateral vs.
  unilateral (`bicep-curl` and `single-arm-curl` look identical — a side view only ever shows one
  arm regardless), true frontal-plane travel (`bw-lateral-lunge`/`bw-cossack-squat`/
  `bw-curtsy-lunge`/`bw-skater-jump` approximate sideways movement with a wide, deep single-side
  stance, not real lateral motion), or a second leg (pistol squat's "other leg extended forward"
  and half-kneeling's front leg are not drawn — only the modeled leg is).
- **`hip-abduction`'s band path is genuinely short**, not a bug: its anchor (under the stance
  foot) and its working joint (the working foot) are anatomically close together, unlike
  squat/lunge/calf where the anchor is at the feet but the tension is felt at the hands.
- **`half-kneeling-pallof`/`half-kneeling-chop`/`half-kneeling-ohp`** render as standing rather
  than half-kneeling in some cases where a dedicated archetype wasn't built — the band-press
  motion itself is still shown correctly, only the kneeling detail is lost. Lower priority than
  the eleven fixed above because the result isn't wrong, just less specific.
- **`tke`/`hamstring-curl`** (pattern `hip_extension`, pre-existing mistag —
  ORCHESTRATION.md carried-forward issue #4) use approximated overrides (`squat`,
  `hip_extension`'s own default) given the mistagging; once that content retag lands, revisit.

### Mechanical facts (unchanged claims, re-verified this round)
- `npm run validate:library`: 200/200 figures, 0 orphans, 402 KB / 3 MB budget, 0 errors.
- `npm run check`: green (typecheck, lint — 0 warnings, test, `check:engine-purity`).
- `packages/data/src/index.test.ts`: 13 tests — coverage, no-orphan-ids, budget, no-video-id,
  variety floor (≥125 distinct geometries), hold-vs-dynamic layout shape, limb-color presence,
  band-path presence, anchor-glyph-in-bounds, and plank-hold ground-contact.
- No new npm dependencies. No changes to `app/`, root `package.json`, or `docs/ORCHESTRATION.md`.

### Cut / not done
- **No wiring into `app/`.** Rendering the figure inside a screen (SVG renderer choice, media-
  ladder tier selection UI) is track `6b-media-ladder`'s scope. The registry (`figureLibrary` in
  `packages/data/src/index.ts`) is a single JSON import, Metro-safe like the existing
  `exerciseLibrary`, no new dependency — but no screen has actually rendered one yet.
- The ~65 exercises that share an already-reviewed geometry were not each individually rendered
  this round (see "What I looked at" above) — they were checked by reading their `setup` cue
  against the shared archetype's reasoning, not by looking at their own pixels.

### Decisions / gotchas
- **Where the archetypes live**: `tools/generate-figures.ts`'s `SHAPES` (pattern-keyed defaults
  plus named extra shapes) and `REUSE_ARCHETYPE`/`POSE_TWEAKS` (exercise-id-keyed overrides). A
  future content fix is a data edit in one of these tables plus `node tools/generate-figures.ts`
  — never a hand-edited SVG.
- **Two-panel canvas layout**: 300×170 viewBox, two 140-wide panels with a 20px gap (divider at
  x=150), OR one panel spanning the full width for a hold. `PANEL`/`LEFT_X`/`RIGHT_X`/`HOLD_X` in
  `tools/generate-figures.ts` are the layout constants if this needs to change again.
- **Ground-contact bug class**: any archetype whose `poseB` is meant to be a floor-contact pose
  (plank, side plank, kneeling fold, bench dip, etc.) needs `poseB` to reach the ground *on its
  own*, independent of `poseA` — because a hold only ever renders `poseB`. When adding a new
  hold-capable archetype, verify hand/foot y against 152 by printing coordinates before
  rendering, the same way this round's fixes were derived (see the node one-liners embedded in
  this session's shell history if that pattern is useful again).
- Contact-sheet montages at 4×5/340px density produced false positives during review (see "Full
  pixel-level review" above) — prefer individual full-size thumbnails or direct SVG string checks
  over a composite grid for any future verification pass.

### Carried-forward issues for the orchestrator to file
- ~65/200 figures share a geometry with an already-individually-rendered exercise and were
  verified by cue-reading, not by looking at their own rendered pixels (see "What I looked at").
  A future pass (or track 6b, once a real screen renders these) should spot-check a random sample
  on-device.
- `half-kneeling-pallof`/`half-kneeling-chop`/`half-kneeling-ohp` lose the "half-kneeling" detail
  in favor of a standing band-press pose that's otherwise correct — noted above as accepted, not
  hidden.
- `tke`/`hamstring-curl`'s figure overrides should be revisited once the pre-existing pattern
  mistag (carried-forward issue #4) is retagged.
