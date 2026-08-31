## Track: 6a-figures — In-house line-art demo figures
Last updated: 2026-08-31

### Done
- [x] Parametric SVG generator (`tools/generate-figures.ts`) — a side-view stick-figure rig built
  from forward kinematics (5 "stances": standing, plank, supine, kneeling, split), driven by a
  17-entry archetype table (one per `Pattern` enum value in `packages/data/src/schema.ts`), plus a
  ~20-exercise override table for exercises whose `setup` cue contradicts their pattern's default
  archetype (see "Decisions/gotchas"). Draws pose A (ghost) + pose B (solid) + a movement arrow +
  a band line/anchor glyph when `equipment === 'band'`.
- [x] `packages/data/library/figures.json` generated — 200/200 exercises, 382 KB total (budget
  3 MB, ~1300x headroom). One SVG per exercise, ~1.9 KB average (brief estimated 5–15 KB each;
  actual figures are simpler/smaller line art and still legible at the intended size).
- [x] `packages/data/src/index.ts` — `figureLibrary: Record<string, string>` static registry,
  a single JSON import mirroring the existing `exerciseLibrary`/`familyLibrary` pattern (commit
  adds this + the validator + the generator).
- [x] `packages/data/src/validate.ts` extended (run via existing `npm run validate:library`) —
  fails if: `figures.json` is missing, any exercise id lacks a figure, any figure key doesn't
  match a real exercise id, a figure entry isn't an SVG string, or total size exceeds 3 MB. Prints
  a coverage line (`Figures: 200 bundled, 382.3 KB total (budget 3 MB).`).
- [x] `packages/data/src/index.test.ts` extended — coverage, no-orphan-ids, budget, and "never
  bundles a youtube/video_id string" tests (belt-and-suspenders on invariant 8, since this track
  touches media).
- [x] `npm run check` green (typecheck, lint — 0 warnings after `eslint --fix` on the two new
  files, test, `check:engine-purity`). `npm run validate:library` green, 0 errors.

Commits (this session, chronological):
1. Generator + first-pass archetypes (buggy angle convention — see below, not committed as-is,
   superseded before commit).
2. Generator with corrected FK angle convention, hip-offset support for whole-body poses,
   per-exercise stance overrides, registry export, validator extension, and tests — this is the
   actual commit. See `git log --oneline -5` for the sha (committed at the end of this session).

### Verified — and how
- **Coverage** (mechanical, trustworthy): `validate:library` + the new jest tests both independently
  confirm 200/200 exercises have a figure, no orphan figure ids, budget far under 3 MB. This is
  "coverage verified," full stop.
- **Legibility/correctness** (partial, human-eyeballed, NOT exhaustive): No SVG rasterizer was
  available in this environment (no rsvg-convert/cairosvg/imagemagick/puppeteer). Used macOS
  `qlmanage -t` (QuickLook thumbnail generation) to rasterize sample SVGs to PNG and viewed them
  with the Read tool — this is a real image render, not a guess from markup. I looked at:
  - One figure per pattern (17), the initial pass — found the FK angles were wrong (arms swinging
    up over the head, legs not reading as legs, one archetype completely broken) and rewrote the
    angle convention and pose tables from scratch, re-verifying with printed joint coordinates
    before re-rendering.
  - A second pass of ~10 more figures after the rewrite, including every exercise touched by an
    override (kneeling-crunch, dead-bug, mountain-climber, tke, banded-push-up, banded-squat, rdl,
    pull-apart, bicep-curl, tricep-pushdown, lateral-raise, side-bend, calf-raise, pallof-press,
    split-squat, hip-abduction, banded-plank) plus band-anchor variety (external anchor pole,
    pull-up bar, floor arc, self-loop).
  - Found and fixed a real legibility bug in that pass: the movement arrow and the band line were
    both teal/green and hard to tell apart at thumbnail size — arrow recolored to red (`#b91c1c`).
  - **What I did NOT do**: read all 200 `setup` cue strings against their final rendered figure
    one by one. What I did instead: read every `setup` string *grouped by pattern* (17 greps) to
    find exercises whose body position clearly contradicts their pattern's plurality-case archetype
    (see overrides below), and spot-rendered a sample per pattern plus every overridden exercise.
    A pattern-conforming exercise I did not individually render (the majority of the 200) is
    "coverage verified, not individually quality-reviewed" — it inherits its pattern archetype's
    reviewed pose, but I have not looked at its specific rendered pixels.
  - **Distinguishing the claim precisely, per the honesty requirement**: coverage (100%, every id
    has *a* figure) is proven. Quality is reviewed for the 17 archetypes + ~20 override cases
    (~37/200, ~18%) by actual rendered-pixel inspection, not just markup reading. The remaining
    ~163 exercises get their pattern's reviewed pose by construction (same archetype, only the
    band-anchor overlay differs, which is a small, separately-verified code path), not by
    individual visual confirmation.

### Cut / not done
- **Unilateral distinction is not visually rendered.** A side-view stick figure looks identical
  whether an exercise is bilateral or unilateral (both real physical and prior schematic
  convention — a side view only ever shows the near-side limb). I judged building a front-view or
  dual-limb-fade variant not worth the remaining budget; `unilateral` is available on the
  `Exercise` record for any consumer that wants to convey it in surrounding UI copy instead.
- **A handful of archetype approximations are honest compromises, not perfect fits** — documented
  inline in `tools/generate-figures.ts`'s `REUSE_ARCHETYPE` comments: `cd-cobra`/`bw-superman`
  (prone lift) and `bw-crab-walk` (seated, hips lifted) reuse the supine/bridge archetype because
  no prone or seated stance was built; `tke` (standing terminal knee extension) reuses the squat
  archetype's standing-leg-loaded shape, which is closer than the pattern's own default
  (hip-extension bridge) but not a precise match; `bw-inchworm` shows only the hinge-forward part
  of a hinge→plank→walk-in movement. None of these contradict their `setup` cue outright (verified
  by re-reading each cue against my override reasoning); they are coarser than a bespoke pose
  would be.
- **No wiring into `app/`.** Per the brief, rendering the figure inside a screen (SVG renderer
  choice, media-ladder tier selection UI) is track `6b-media-ladder`'s scope, not mine. I confirmed
  the registry shape is Metro-safe (a single JSON import identical in kind to the already-shipping
  `exerciseLibrary`, so it needs no metro.config change and no new dependency) but did not run the
  app to prove a screen can actually render one — that proof belongs to whichever track first
  consumes `figureLibrary`.

### Decisions / gotchas
- **No new runtime dependency.** Figures are raw SVG markup strings inside JSON, not files needing
  Metro's asset pipeline and not requiring `react-native-svg` (not installed in this repo) for the
  *generation/bundling* side. A future consumer (6b) will need an SVG renderer (e.g.
  `react-native-svg`'s `SvgXml`, or a `WebView`) to actually paint the string — that dependency
  decision belongs to 6b, flagged here so it isn't a surprise.
- **Angle convention bug, caught by actually rendering, not by validator green.** My first pass
  used absolute forearm/shin angles that put arms over the head and produced illegible poses
  despite validator coverage staying 100% green throughout — a textbook instance of this project's
  "standing lesson" (green tests aren't proof of correctness) applying to *me*, not just prior
  waves. Caught because I rendered and looked, per this track's explicit brief instruction.
  Rewrote with a documented, verified angle convention (see the comment block above `ARCHETYPES`
  in `tools/generate-figures.ts`) and a `hipOffset` mechanism so whole-body poses (squat depth,
  push-up height, hip bridge) can translate the rig, not just swing limbs from a fixed root.
  Root-caused by printing joint coordinates and checking them by hand before re-rendering.
- **Where the 17 archetypes live and how to extend them**: `tools/generate-figures.ts`'s
  `ARCHETYPES` (pattern-keyed) and `REUSE_ARCHETYPE`/`CUSTOM_ARCHETYPES` (exercise-id-keyed
  overrides). A future content pass fixing a bad figure is a data edit in one of those three
  tables plus re-running `node tools/generate-figures.ts` — never a hand-edited SVG.
- Did not touch root `package.json`'s `check` script, `app/`, or `docs/ORCHESTRATION.md` — avoids
  collision with tracks `6b`–`6e` per the orchestration doc's serialization warning. Wired the
  validator into `packages/data`'s existing `validate:library` script instead.
- No new npm dependencies of any kind were added.

### Carried-forward issues for the orchestrator to file
- Figure *quality* was rendered-and-reviewed for the 17 archetypes and ~20 override exercises
  (~18% of the library by direct pixel inspection); the remaining ~163 pattern-conforming
  exercises inherit a reviewed pose by construction but were not individually rendered and
  eyeballed. A future pass (or track 6b, once it wires a real screen) should spot-check a larger
  random sample on-device, the same way Wave 4/5's "Jest-passed but not device-verified" gap was
  tracked.
- `tke` and `hamstring-curl` are tagged pattern `hip_extension` but are actually knee-flexion
  movements (this is the *existing* carried-forward issue #4, not new) — their figures now use
  reasonable per-exercise overrides given the mistagging, but the correct long-term fix is still
  the content retag issue #4 already describes; once that lands, these two exercises' figure
  overrides should be revisited (they may no longer need one under a `knee_flexion_loaded`
  archetype).
