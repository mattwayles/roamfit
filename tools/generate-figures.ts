/**
 * Generates the bundled in-house line-art demo figures (§11.4 tier 2) for every exercise in
 * `packages/data/library/exercises.json`.
 *
 * Composes each figure from a small set of reusable primitives rather than hand-authoring ~200
 * unique SVGs: a stick-figure rig (head/torso/arm/leg, forward-kinematics from a joint table),
 * laid out as two side-by-side panels (start pose | end pose) with a divider and a movement arrow
 * between them — or, for an isometric hold (`metric === 'time'`), a single panel with a pause
 * glyph instead of a second pose and an arrow. Body pose comes from a per-`pattern` archetype
 * table (SHAPES below) — the reviewable artifact a human can check against `setup` cue text far
 * faster than 200 SVG blobs. A per-exercise override table (REUSE_ARCHETYPE / CUSTOM_SHAPES)
 * handles exercises whose `setup` cue is a genuinely different body position than their pattern's
 * plurality case. Band anchor *position* is read per-exercise from that exercise's own `anchor`
 * field, so it stays accurate even when the pose is shared.
 *
 * Output: packages/data/library/figures.json — { exercise_id: "<svg ...>...</svg>" }
 *
 * Run: node tools/generate-figures.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'packages', 'data', 'library');

// ---------------------------------------------------------------------------------------------
// Minimal local types (kept independent of packages/data/src/schema.ts so this script has no
// build-order dependency on the workspace — it only ever reads the compiled JSON).
// ---------------------------------------------------------------------------------------------

interface Exercise {
  id: string;
  name: string;
  pattern: string;
  equipment: 'band' | 'bodyweight';
  anchor: string;
  unilateral: boolean;
  metric: 'reps' | 'time' | 'amrap';
  setup: string;
}

interface Point {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------------------------
// Forward kinematics
// ---------------------------------------------------------------------------------------------

/** angleDeg measured screen-style: 0 = pointing right (+x), 90 = pointing down (+y). */
function project(origin: Point, angleDeg: number, length: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: origin.x + length * Math.cos(rad), y: origin.y + length * Math.sin(rad) };
}

const LEN = {
  torso: 40,
  neck: 10,
  upperArm: 24,
  forearm: 22,
  upperLeg: 26,
  lowerLeg: 24,
  headR: 9,
};

/**
 * A "stance" fixes the hip (root) position, in the *local coordinate space of a single panel*
 * (see PANEL below), for a family of poses. Everything else (torso angle, arm angles, leg
 * angles) is supplied per-pose by the archetype.
 */
type StanceId = 'standing' | 'plank' | 'supine' | 'kneeling' | 'split';

const STANCES: Record<StanceId, Point> = {
  standing: { x: 63, y: 90 },
  plank: { x: 75, y: 82 },
  // x moved from 70 to 50 in round 3: several supine archetypes (flexion, reverse_crunch_shape,
  // leg_raise_shape, prone_extension, side_lying_abduction, seated_twist, floor_press) rest an
  // arm near torsoAngle 0 with the shoulder/elbow swung up toward ~340-350°, and at x:70 that
  // reach ran the hand's local x up to ~155 — inside the RIGHT panel (translate +160) that's
  // canvas x ~315, clipped 15-18px off the right edge (confirmed by extracting every drawn
  // line/circle/path coordinate from the bundled SVGs, not by eyeballing). Shifting the whole
  // supine stance 20px left gives every one of those archetypes room without touching their
  // individually-tuned pose angles; verified afterward that no supine archetype's minimum local
  // x went negative (see STATUS-6a-figures.md's round-3 notes for the full sweep).
  supine: { x: 50, y: 106 },
  kneeling: { x: 60, y: 98 },
  split: { x: 68, y: 90 },
};

/**
 * One pose: full set of angles (screen-style, 0=+x/right, 90=+y/down) needed to place every
 * joint from the stance's hip root outward.
 *   torsoAngle   — direction from hip to shoulder (270 = straight up = standing tall)
 *   shoulderAngle / elbowAngle — arm, shoulder->elbow->hand
 *   hipAngle / kneeAngle       — leg, hip->knee->foot
 * Angle convention (verified by printing coordinates, not assumed — see STATUS-6a-figures.md):
 *   90 = straight down, 270 = straight up, 0 = right/forward, 180 = left/backward.
 *   Standing baseline: torsoAngle 270 (shoulder above hip); arm hanging at the side is
 *   shoulderAngle/elbowAngle ~100 (down, slightly forward); a straight leg is ~90/90.
 */
interface PoseAngles {
  torsoAngle: number;
  shoulderAngle: number;
  elbowAngle: number;
  hipAngle: number;
  kneeAngle: number;
  /** Whole-rig translation from the stance's hip root, for poses where the body as a whole
   *  rises/sinks/leans (squat depth, lunge, hip bridge, push-up height) rather than just a limb
   *  swinging from a fixed root. Defaults to no offset. */
  hipOffset?: Point;
  /** Small rectangle drawn under a joint to depict an elevated surface (step, bench, tailgate) —
   *  used by the incline/decline/step-up family. */
  platformUnder?: 'hand' | 'foot';
  /** A rear-foot-elevated bench, drawn at a fixed offset behind the hip rather than under a
   *  joint — this rig only models one leg, so there is no "back foot" position to hang a
   *  platform from the way `platformUnder` does (Bulgarian split squat). */
  benchBehindHip?: boolean;
}

interface RigPoints {
  head: Point;
  shoulder: Point;
  elbow: Point;
  hand: Point;
  hip: Point;
  knee: Point;
  foot: Point;
}

function buildRig(stance: StanceId, pose: PoseAngles): RigPoints {
  const root = STANCES[stance];
  const offset = pose.hipOffset ?? { x: 0, y: 0 };
  const hip = { x: root.x + offset.x, y: root.y + offset.y };
  const shoulder = project(hip, pose.torsoAngle, LEN.torso);
  const head = project(shoulder, pose.torsoAngle, LEN.neck);
  const elbow = project(shoulder, pose.shoulderAngle, LEN.upperArm);
  const hand = project(elbow, pose.elbowAngle, LEN.forearm);
  const knee = project(hip, pose.hipAngle, LEN.upperLeg);
  const foot = project(knee, pose.kneeAngle, LEN.lowerLeg);
  return { head, shoulder, elbow, hand, hip, knee, foot };
}

type TrackedJoint = keyof RigPoints;

interface Archetype {
  stance: StanceId;
  poseA: PoseAngles;
  poseB: PoseAngles;
  track: TrackedJoint;
  bandJoint: TrackedJoint;
  /** True for a small number of shapes that are always a hold regardless of `metric` (none
   *  currently need this — metric === 'time' is the sole, data-driven signal per the brief's own
   *  instruction not to hand-list ids — but the hook exists in case a future exercise needs it). */
  forceHold?: boolean;
}

// ---------------------------------------------------------------------------------------------
// SHAPES — 17 pattern-default archetypes (one per `Pattern` enum value in packages/data/src/
// schema.ts) plus named extra shapes used only via REUSE_ARCHETYPE, for exercises whose body
// position is a genuinely different movement than their pattern's plurality case.
// ---------------------------------------------------------------------------------------------

const SHAPES: Record<string, Archetype> = {
  // ---- pattern defaults ----

  // Low elbow-bent floor position rising to a straight-arm plank (hips rise with the press).
  horizontal_push: {
    stance: 'plank',
    poseA: {
      torsoAngle: 195,
      shoulderAngle: 110,
      elbowAngle: 60,
      hipAngle: 15,
      kneeAngle: 15,
      hipOffset: { x: 0, y: 18 },
    },
    poseB: {
      torsoAngle: 215,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 15,
      kneeAngle: 15,
      hipOffset: { x: 0, y: -4 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Hands racked at the shoulder pressed to full overhead lockout.
  vertical_push: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 260, hipAngle: 92, kneeAngle: 88 },
    // hipOffset nudges the locked-out hand down 4px from its unshifted position (hand.y 4.7):
    // an anchor === 'none' band exercise using this pose (pike-push-up) draws a loop ellipse
    // (ry 6) around the hand, whose top clipped 1.3px above the canvas without this margin
    // (round 3).
    poseB: {
      torsoAngle: 270,
      shoulderAngle: 280,
      elbowAngle: 280,
      hipAngle: 92,
      kneeAngle: 88,
      hipOffset: { x: 0, y: 4 },
    },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Arms reach forward, elbows drive back pulling hands to the torso.
  horizontal_pull: {
    stance: 'standing',
    poseA: { torsoAngle: 260, shoulderAngle: 350, elbowAngle: 350, hipAngle: 92, kneeAngle: 88 },
    poseB: { torsoAngle: 260, shoulderAngle: 170, elbowAngle: 170, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Hands overhead pulled down to shoulder/chest height (mirror of vertical_push).
  vertical_pull: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 92, kneeAngle: 88 },
    poseB: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 260, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Standing tall down into hip/knee-bent squat depth (whole rig sinks).
  squat: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 260, hipAngle: 92, kneeAngle: 88 },
    // Depth exaggerated (hipAngle/kneeAngle pushed further than a real squat) because this is a
    // schematic, not anatomy — the orchestrator found the original delta too subtle to read as a
    // squat at thumbnail size. hipOffset.y is 22, not the 34 an earlier round used: at 34 the
    // foot lands at y=162.7, 10.7px through the y=152 ground line (round 3 finding, confirmed by
    // computing hip/knee/foot y directly rather than assuming — the deep knee/hip bend angles
    // still read clearly as a squat at 22; only the whole-rig drop was reduced).
    poseB: {
      torsoAngle: 250,
      shoulderAngle: 350,
      elbowAngle: 260,
      hipAngle: 122,
      kneeAngle: 44,
      hipOffset: { x: -8, y: 22 },
    },
    track: 'hip',
    // Band exercises in this pattern are anchored under the feet ('stance') but held in the
    // hands ('ends at shoulders', 'front-rack', etc. — see every squat-family setup cue); Finding
    // 5's "small stray mark" was this defaulting to 'foot', which put the anchor and the working
    // joint at the same point.
    bandJoint: 'hand',
  },
  // Standing tall hinging forward at the hip, knees soft, arms holding the load down in front.
  hinge: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: {
      torsoAngle: 200,
      shoulderAngle: 130,
      elbowAngle: 130,
      hipAngle: 100,
      kneeAngle: 95,
      hipOffset: { x: 6, y: 4 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Split stance: standing tall to a front-knee-bent lunge (whole rig sinks toward the front leg).
  lunge: {
    stance: 'split',
    poseA: { torsoAngle: 270, shoulderAngle: 110, elbowAngle: 110, hipAngle: 100, kneeAngle: 92 },
    // hipOffset.y 17, not 22 — at 22 the foot lands 3.2px through the ground line (round 3
    // finding, same class of bug as squat's).
    poseB: {
      torsoAngle: 265,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 115,
      kneeAngle: 55,
      hipOffset: { x: -4, y: 17 },
    },
    track: 'hip',
    // See squat's comment: 'stance'/'feet' anchors are under the feet, but the band is held in
    // the hands ("ends over shoulders") for this pattern's band exercises.
    bandJoint: 'hand',
  },
  // Hips down (bridge start) to hips fully extended (bridge top).
  hip_extension: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 60, elbowAngle: 60, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 5,
      shoulderAngle: 60,
      elbowAngle: 60,
      hipAngle: 100,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -20 },
    },
    track: 'hip',
    // The band drapes over the hips for every exercise that reuses this shape ("band over hips"),
    // not held in the hand or looped at the foot.
    bandJoint: 'hip',
  },
  // Limbs together brought out to the side (lateral raise / band walk / clamshell family).
  abduction: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 190, elbowAngle: 190, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'foot',
  },
  // Same standing pose as `abduction`, but the band loops the *thighs* (lateral walk / monster
  // walk), not the ankle — the loop glyph needs to sit at the knee, not the foot, or it reads as
  // an ankle band even though the cue says "around thighs."
  abduction_thigh: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 190, elbowAngle: 190, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'knee',
  },
  // Heels down to full plantarflexion (calf raise) — small whole-body rise.
  calf: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 92, kneeAngle: 88 },
    poseB: {
      torsoAngle: 270,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 92,
      kneeAngle: 88,
      hipOffset: { x: 0, y: -8 },
    },
    track: 'foot',
    // Calf-raise band exercises hold the ends "at shoulders or hips," not the foot the band is
    // anchored under — same fix as squat/lunge above.
    bandJoint: 'hand',
  },
  // Hands centered at the chest pressed straight out to the side against rotation (pallof press).
  anti_rotation: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 350, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 20, elbowAngle: 20, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Getting set on hands and knees rising into a braced plank hold (isometric core work).
  anti_extension: {
    stance: 'kneeling',
    poseA: { torsoAngle: 230, shoulderAngle: 130, elbowAngle: 90, hipAngle: 40, kneeAngle: 130 },
    // Straight-line plank, redesigned round 3. hipAngle/kneeAngle both 10 make the leg exactly
    // collinear with the torso (torsoAngle 190 continued past the hip is 190-180=10) — shoulder,
    // hip, knee, and foot all sit on one straight diagonal, which is the actual coaching cue
    // ("straight line from head through hips to heels"). The arm is a separate straight prop
    // (shoulderAngle/elbowAngle both 20, not collinear with the body line) tuned so hand.y lands
    // within 0.1px of foot.y — both ~2.3px above the y=152 ground line. Computed by printing
    // coordinates, not assumed: hip.y=141.0, shoulder.y=134.0, hand.y=149.8, foot.y=149.7.
    // The previous version (hand 155.6, foot 165.0 — floating THROUGH the floor by 3.6-13.0px,
    // per an old comment here claiming ~147/~149 that was never rechecked against actual output)
    // used hipAngle 155 / kneeAngle 165, which is NOT collinear with torsoAngle 190 (needs
    // exactly 190-180=10) and produced the hinge/pike shape the orchestrator flagged as reading
    // like a pike, not a plank.
    poseB: {
      torsoAngle: 190,
      shoulderAngle: 20,
      elbowAngle: 20,
      hipAngle: 10,
      kneeAngle: 10,
      hipOffset: { x: 4, y: 43 },
    },
    track: 'hip',
    bandJoint: 'foot',
  },
  // Lying flat curling the torso up (crunch / sit-up / leg raise family default: the crunch).
  flexion: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 20, elbowAngle: 20, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 320,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 100,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -6 },
    },
    track: 'shoulder',
    bandJoint: 'foot',
  },
  // Neutral upright torso leaning to the side (side bend / side plank family).
  lateral_flexion: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 250, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Curl: elbow extended at the side to fully flexed, hand to shoulder.
  elbow_flexion: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 260, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Extension: elbow flexed at the shoulder to fully extended (triceps pushdown/kickback family).
  elbow_extension: {
    stance: 'standing',
    poseA: { torsoAngle: 260, shoulderAngle: 40, elbowAngle: 260, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 260, shoulderAngle: 40, elbowAngle: 60, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Arm at the side raised to shoulder height (lateral raise, face pull, rotation family).
  shoulder_isolation: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 190, elbowAngle: 190, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },

  // ---- named extra shapes (reused only via REUSE_ARCHETYPE) ----

  // Kneeling, leaning down toward the hips (kneeling cable crunch / band sit-up family).
  kneeling_situp: {
    stance: 'kneeling',
    poseA: { torsoAngle: 260, shoulderAngle: 260, elbowAngle: 80, hipAngle: 20, kneeAngle: 130 },
    poseB: { torsoAngle: 190, shoulderAngle: 220, elbowAngle: 80, hipAngle: 20, kneeAngle: 130 },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Prone, lifting the chest/shoulders off the ground (cobra / superman family). Hips stay down —
  // the mirror-image emphasis of hip_extension's bridge, where the *hips* rise and the torso
  // stays put.
  prone_extension: {
    stance: 'supine',
    poseA: { torsoAngle: 15, shoulderAngle: 350, elbowAngle: 350, hipAngle: 95, kneeAngle: 265 },
    poseB: {
      torsoAngle: 345,
      shoulderAngle: 350,
      elbowAngle: 350,
      hipAngle: 95,
      kneeAngle: 265,
      hipOffset: { x: 0, y: -14 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Seated back on the heels, arms extended long on the ground (child's pose) — a resting fold,
  // not a braced plank.
  kneeling_fold: {
    stance: 'kneeling',
    poseA: { torsoAngle: 250, shoulderAngle: 300, elbowAngle: 320, hipAngle: 30, kneeAngle: 140 },
    // Ground-contact verified: hand (21.2, 152.0) and foot (112.5, 153.1) both land on the
    // ground line and stay within the panel's x bounds (an earlier version put the hand at
    // negative x, off the left edge of the canvas).
    // hipOffset.y 17.5, not 20 — at 20 the foot lands 1.1px through the ground line (round 3).
    poseB: {
      torsoAngle: 150,
      shoulderAngle: 165,
      elbowAngle: 165,
      hipAngle: 40,
      kneeAngle: 130,
      hipOffset: { x: 48, y: 17.5 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
    forceHold: true,
  },
  // On the back, one leg pulled toward the chest (figure-four / hamstring stretch family).
  supine_stretch: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 340, elbowAngle: 340, hipAngle: 100, kneeAngle: 260 },
    poseB: { torsoAngle: 0, shoulderAngle: 300, elbowAngle: 300, hipAngle: 350, kneeAngle: 350 },
    track: 'knee',
    bandJoint: 'foot',
    forceHold: true,
  },
  // Back knee down, front knee bent, torso tall and slightly forward (half-kneeling hip-flexor
  // stretch / half-kneeling anchor position).
  half_kneeling: {
    stance: 'kneeling',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 100, kneeAngle: 92 },
    // Ground-contact verified: foot.y 151.5, close enough to the ground line that the back
    // shin reads as resting on the floor (this rig only models one leg, so the front knee/foot
    // is not separately drawn — an accepted simplification, see STATUS-6a-figures.md).
    poseB: {
      torsoAngle: 260,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 40,
      kneeAngle: 115,
      hipOffset: { x: 0, y: 15 },
    },
    track: 'hip',
    bandJoint: 'hand',
    forceHold: true,
  },
  // Lying on the side, top arm sweeping open (thoracic rotation stretch).
  side_lying_rotation: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 350, elbowAngle: 350, hipAngle: 90, kneeAngle: 260 },
    poseB: { torsoAngle: 0, shoulderAngle: 270, elbowAngle: 270, hipAngle: 90, kneeAngle: 260 },
    track: 'hand',
    bandJoint: 'hand',
    forceHold: true,
  },
  // Propped on one forearm, body straight, hips lifted (side plank hold).
  side_plank_hold: {
    stance: 'plank',
    poseA: { torsoAngle: 205, shoulderAngle: 130, elbowAngle: 90, hipAngle: 15, kneeAngle: 8 },
    // Ground-contact verified: hand.y 152.5, foot.y 150.7 — both land on the y=152 ground line
    // (see the anti_extension comment above for why this matters).
    poseB: {
      torsoAngle: 205,
      shoulderAngle: 130,
      elbowAngle: 90,
      hipAngle: 35,
      kneeAngle: 35,
      hipOffset: { x: 0, y: 40 },
    },
    track: 'hip',
    bandJoint: 'foot',
    forceHold: true,
  },
  // Side plank with a dynamic hip dip / top-leg raise on top of it.
  side_plank_dynamic: {
    stance: 'plank',
    poseA: {
      torsoAngle: 205,
      shoulderAngle: 130,
      elbowAngle: 90,
      hipAngle: 35,
      kneeAngle: 35,
      hipOffset: { x: 0, y: 40 },
    },
    // Both exercises that use this shape are metric === 'time' (side-plank-abduction,
    // bw-side-plank-hip-dip), so only poseB ever renders (as a hold) — ground-contact verified
    // the same way as side_plank_hold, with the knee/foot lifted slightly to show the top-leg
    // raise/hip-dip motion rather than a flat plank.
    poseB: {
      torsoAngle: 205,
      shoulderAngle: 130,
      elbowAngle: 90,
      hipAngle: 30,
      kneeAngle: 20,
      hipOffset: { x: 0, y: 38 },
    },
    track: 'knee',
    bandJoint: 'knee',
  },
  // Standing, hands clasped behind the back, chest lifted and opened (chest stretch).
  standing_reach: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 260, shoulderAngle: 130, elbowAngle: 150, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
    forceHold: true,
  },
  // Staggered stance leaning into a wall, back heel down (calf stretch).
  calf_wall_stretch: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: {
      torsoAngle: 245,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 100,
      kneeAngle: 95,
      hipOffset: { x: -6, y: 2 },
    },
    track: 'foot',
    bandJoint: 'foot',
    forceHold: true,
  },
  // Seated, torso and shins both lifted into a V (boat hold).
  seated_boat: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 340, elbowAngle: 340, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 310,
      shoulderAngle: 300,
      elbowAngle: 300,
      hipAngle: 320,
      kneeAngle: 330,
      hipOffset: { x: 0, y: -8 },
    },
    track: 'shoulder',
    bandJoint: 'foot',
    forceHold: true,
  },
  // Hands and knees, opposite arm and leg reaching to full extension (bird-dog family).
  quadruped_reach: {
    stance: 'kneeling',
    poseA: { torsoAngle: 195, shoulderAngle: 100, elbowAngle: 100, hipAngle: 15, kneeAngle: 15 },
    poseB: { torsoAngle: 195, shoulderAngle: 300, elbowAngle: 300, hipAngle: 340, kneeAngle: 340 },
    track: 'hand',
    bandJoint: 'foot',
  },
  // One leg extended straight forward, squatting to depth on the other (pistol squat).
  pistol_squat: {
    stance: 'standing',
    poseA: {
      torsoAngle: 270,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 92,
      kneeAngle: 88,
    },
    poseB: {
      torsoAngle: 250,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 40,
      kneeAngle: 100,
      hipOffset: { x: -4, y: 20 },
    },
    track: 'hip',
    bandJoint: 'foot',
  },
  // Squat depth exploding into an airborne extension (jump squat).
  jump_squat: {
    stance: 'standing',
    // hipOffset.y 15, not 22 (poseA — was 5.2px through the ground) and -10, not -18 (poseB —
    // the "hand" marker at the jump apex was clipped 5.7px above the canvas top). Both round 3.
    poseA: {
      torsoAngle: 255,
      shoulderAngle: 220,
      elbowAngle: 320,
      hipAngle: 110,
      kneeAngle: 60,
      hipOffset: { x: -4, y: 15 },
    },
    poseB: {
      torsoAngle: 270,
      shoulderAngle: 300,
      elbowAngle: 320,
      hipAngle: 100,
      kneeAngle: 130,
      hipOffset: { x: 0, y: -10 },
    },
    track: 'hip',
    bandJoint: 'hand', // squat-jump holds the band "at shoulders," same fix as the plain squat
  },
  // Hinge and swing into a forward broad jump.
  broad_jump: {
    stance: 'standing',
    poseA: { torsoAngle: 230, shoulderAngle: 210, elbowAngle: 320, hipAngle: 100, kneeAngle: 95 },
    poseB: {
      torsoAngle: 250,
      shoulderAngle: 300,
      elbowAngle: 330,
      hipAngle: 60,
      kneeAngle: 150,
      hipOffset: { x: 24, y: -10 },
    },
    track: 'hip',
    bandJoint: 'foot',
  },
  // Feet and arms together, jumped out wide overhead (jumping jack).
  jumping_jack: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 290, elbowAngle: 290, hipAngle: 60, kneeAngle: 100 },
    track: 'hand',
    bandJoint: 'foot',
  },
  // Standing, one knee driven high toward the chest (high knees).
  high_knees: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 265, shoulderAngle: 340, elbowAngle: 60, hipAngle: 350, kneeAngle: 40 },
    track: 'knee',
    bandJoint: 'foot',
  },
  // Standing, drop the hands to the floor and jump the feet back into a plank (burpee/squat-
  // thrust/sprawl family) — reuses the get-into-plank transition, which is the clearest single
  // shared cue across all three.
  squat_to_plank: {
    stance: 'kneeling',
    poseA: { torsoAngle: 260, shoulderAngle: 230, elbowAngle: 320, hipAngle: 100, kneeAngle: 60 },
    // Same straight-line-plank angles as anti_extension's poseB (see its comment) — the plank
    // end of a burpee/squat-thrust/sprawl needs hands and feet on the floor just as much as a
    // static plank, without the pike/floor-penetration bug round 3 found and fixed there.
    poseB: {
      torsoAngle: 190,
      shoulderAngle: 20,
      elbowAngle: 20,
      hipAngle: 10,
      kneeAngle: 10,
      hipOffset: { x: 4, y: 43 },
    },
    track: 'hip',
    bandJoint: 'hand',
  },
  // Front foot elevated on a step, driving up through the heel (step-up).
  elevated_front_step: {
    stance: 'split',
    poseA: {
      torsoAngle: 270,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 100,
      kneeAngle: 92,
      platformUnder: 'foot',
    },
    poseB: {
      torsoAngle: 270,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 95,
      kneeAngle: 88,
      hipOffset: { x: 4, y: -18 },
      platformUnder: 'foot',
    },
    track: 'hip',
    bandJoint: 'hand', // the banded variant holds the band "ends at shoulders" too
  },
  // Rear foot elevated on a bench, dropping the front knee to depth (Bulgarian split squat).
  elevated_rear_foot: {
    stance: 'split',
    poseA: {
      torsoAngle: 270,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 100,
      kneeAngle: 92,
      benchBehindHip: true,
    },
    // hipOffset.y 17, not 20 — at 20 the foot lands 1.2px through the ground line (round 3).
    poseB: {
      torsoAngle: 262,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 115,
      kneeAngle: 55,
      hipOffset: { x: -4, y: 17 },
      benchBehindHip: true,
    },
    track: 'hip',
    bandJoint: 'hand', // the banded variant holds the band "ends at shoulders"
  },
  // High plank driving one knee toward the chest, alternating (mountain climber).
  plank_knee_drive: {
    stance: 'plank',
    poseA: { torsoAngle: 215, shoulderAngle: 100, elbowAngle: 100, hipAngle: 15, kneeAngle: 15 },
    poseB: { torsoAngle: 215, shoulderAngle: 100, elbowAngle: 100, hipAngle: 340, kneeAngle: 300 },
    track: 'knee',
    bandJoint: 'hand',
  },
  // Standing, pressing straight out from the chest (band chest press — not a floor plank).
  standing_press: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 350, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 340, elbowAngle: 340, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Lying on the back pressing straight up (floor press — a bench-press pose, not a plank).
  floor_press: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 60, elbowAngle: 340, hipAngle: 100, kneeAngle: 260 },
    poseB: { torsoAngle: 0, shoulderAngle: 300, elbowAngle: 300, hipAngle: 100, kneeAngle: 260 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Arms stay down at the sides; the shoulder/trap line rises and drops (shrug — not an arm raise).
  shrug: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: {
      torsoAngle: 268,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 95,
      kneeAngle: 90,
      hipOffset: { x: 0, y: -4 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Arm swings forward and up (front raise — the sagittal-plane raise, distinct from a lateral
  // raise's out-to-the-side arc).
  front_raise: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 330, elbowAngle: 330, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Hinged forward at the hip, straight arms sweeping out/back (reverse fly / bent-over Y raise).
  bent_over_raise: {
    stance: 'standing',
    poseA: {
      torsoAngle: 210,
      shoulderAngle: 130,
      elbowAngle: 130,
      hipAngle: 100,
      kneeAngle: 95,
      hipOffset: { x: 6, y: 2 },
    },
    poseB: {
      torsoAngle: 210,
      shoulderAngle: 250,
      elbowAngle: 250,
      hipAngle: 100,
      kneeAngle: 95,
      hipOffset: { x: 6, y: 2 },
    },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Half-kneeling, pressing overhead (distinct from the standing overhead press).
  half_kneeling_press: {
    stance: 'kneeling',
    poseA: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 260, hipAngle: 100, kneeAngle: 92 },
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 100, kneeAngle: 92 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Hanging from a bar with straight arms (dead hang) — not the "hands pulled to the shoulder"
  // end state that vertical_pull's default poseB would otherwise show for this hold.
  dead_hang: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
    forceHold: true,
  },
  // Hinge over one leg, the other extending straight back (single-leg RDL).
  single_leg_hinge: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: {
      torsoAngle: 190,
      shoulderAngle: 130,
      elbowAngle: 130,
      hipAngle: 355,
      kneeAngle: 5,
      hipOffset: { x: 8, y: 6 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Hinge continuing into an explosive upright row to the chin (deadlift high-pull).
  hinge_to_pull: {
    stance: 'standing',
    // hipOffset.x 8, not 6 — at 6 the hand marker's left edge clipped ~1px off the canvas
    // (round 3; same shared poseA/fix as hinge_to_press).
    poseA: {
      torsoAngle: 200,
      shoulderAngle: 130,
      elbowAngle: 130,
      hipAngle: 105,
      kneeAngle: 100,
      hipOffset: { x: 8, y: 4 },
    },
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 60, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Hinge continuing into an explosive pull and overhead press (clean and press).
  hinge_to_press: {
    stance: 'standing',
    // Same fix and reason as hinge_to_pull's poseA (round 3): hipOffset.x 8, not 6.
    poseA: {
      torsoAngle: 200,
      shoulderAngle: 130,
      elbowAngle: 130,
      hipAngle: 105,
      kneeAngle: 100,
      hipOffset: { x: 8, y: 4 },
    },
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Squat depth standing up into an overhead press (thruster / squat-to-press).
  squat_to_press: {
    stance: 'standing',
    // hipOffset.y 15, not 24 — at 24 the foot lands 7.2px through the ground line (round 3, same
    // leg angles/fix as jump_squat's poseA).
    poseA: {
      torsoAngle: 255,
      shoulderAngle: 350,
      elbowAngle: 260,
      hipAngle: 110,
      kneeAngle: 60,
      hipOffset: { x: -6, y: 15 },
    },
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Squat standing up into a diagonal chop across the body (squat-to-chop).
  squat_to_chop: {
    stance: 'standing',
    // hipOffset.y 15, not 24 — same fix and reason as squat_to_press's poseA (round 3).
    poseA: {
      torsoAngle: 255,
      shoulderAngle: 20,
      elbowAngle: 20,
      hipAngle: 110,
      kneeAngle: 60,
      hipOffset: { x: -6, y: 15 },
    },
    poseB: { torsoAngle: 270, shoulderAngle: 300, elbowAngle: 300, hipAngle: 92, kneeAngle: 88 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Hips piked high, head lowering toward the ground between the hands (pike push-up) — not a
  // standing overhead press.
  pike_push_up: {
    stance: 'plank',
    // hipOffset.y 4, not -14, on both poses — at -14 the hand marker clipped up to 14.3px above
    // the canvas top (round 3, found by sweeping every drawn coordinate, not just the right
    // edge — the head-lowering pike position pushes the hand furthest up of any archetype).
    poseA: {
      torsoAngle: 245,
      shoulderAngle: 260,
      elbowAngle: 340,
      hipAngle: 355,
      kneeAngle: 15,
      hipOffset: { x: -10, y: 4 },
    },
    poseB: {
      torsoAngle: 245,
      shoulderAngle: 250,
      elbowAngle: 250,
      hipAngle: 355,
      kneeAngle: 15,
      hipOffset: { x: -10, y: 4 },
    },
    track: 'head',
    bandJoint: 'hand',
  },
  // Seated on a bench, hands behind on the edge, legs out front, lowering via the elbows (bench
  // dip) — not a standing press.
  bench_dip: {
    stance: 'kneeling',
    poseA: {
      torsoAngle: 280,
      shoulderAngle: 190,
      elbowAngle: 130,
      hipAngle: 355,
      kneeAngle: 10,
      hipOffset: { x: 0, y: -6 },
      platformUnder: 'hand',
    },
    poseB: {
      torsoAngle: 265,
      shoulderAngle: 190,
      elbowAngle: 190,
      hipAngle: 355,
      kneeAngle: 10,
      hipOffset: { x: 0, y: -16 },
      platformUnder: 'hand',
    },
    track: 'hip',
    bandJoint: 'hand',
  },
  // Inverted against a wall, pressing out of a handstand (handstand push-up) — head near the
  // ground, feet up above the hip, the clearest possible visual difference from a standing
  // press. Note the leg angles point *up* (260, not the standing convention's ~90/down) because
  // the whole rig is inverted (torsoAngle 90 puts the shoulder *below* the hip) — verified by
  // printing joint coordinates before rendering, after an initial version put the feet below the
  // hands (see STATUS-6a-figures.md).
  handstand_press: {
    stance: 'plank',
    poseA: {
      torsoAngle: 90,
      shoulderAngle: 100,
      elbowAngle: 60,
      hipAngle: 260,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -15 },
    },
    // hipOffset.y -29, not -35 — at -35 the foot marker clipped ~5px above the canvas top
    // (round 3).
    poseB: {
      torsoAngle: 90,
      shoulderAngle: 100,
      elbowAngle: 60,
      hipAngle: 260,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -29 },
    },
    track: 'head',
    bandJoint: 'hand',
  },
  // Kneeling, spine arching and rounding (cat-cow) — a slow mobility undulation, not a plank brace.
  cat_cow: {
    stance: 'kneeling',
    poseA: { torsoAngle: 205, shoulderAngle: 100, elbowAngle: 100, hipAngle: 15, kneeAngle: 15 },
    poseB: { torsoAngle: 185, shoulderAngle: 100, elbowAngle: 100, hipAngle: 15, kneeAngle: 15 },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Hands and knees, one leg kicking up and back (donkey kick / glute kickback) — the leg moves,
  // the supporting arms do not (distinct from bird-dog's opposite-arm reach).
  donkey_kick: {
    stance: 'kneeling',
    poseA: { torsoAngle: 195, shoulderAngle: 100, elbowAngle: 100, hipAngle: 15, kneeAngle: 15 },
    poseB: { torsoAngle: 195, shoulderAngle: 100, elbowAngle: 100, hipAngle: 340, kneeAngle: 300 },
    track: 'knee',
    bandJoint: 'foot',
  },
  // Wide, deep stance shifted onto one side (lateral lunge / Cossack squat / curtsy lunge /
  // skater bound family). A side-view rig cannot show true frontal-plane travel — this is a
  // documented approximation (wide stance + deep single-side bend), not a faithful depiction of
  // sideways motion; see STATUS-6a-figures.md.
  lateral_lunge_shape: {
    stance: 'split',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 100, kneeAngle: 92 },
    // hipOffset.y 16, not 20 — at 20 the foot lands 2.0px through the ground line (round 3).
    poseB: {
      torsoAngle: 255,
      shoulderAngle: 220,
      elbowAngle: 320,
      hipAngle: 100,
      kneeAngle: 50,
      hipOffset: { x: -14, y: 16 },
    },
    track: 'hip',
    bandJoint: 'hand',
  },
  // Push-up from the knees — a shortened plank (the "shin" folds back short instead of extending
  // full leg-length) rather than kneeling_situp's sit-back fold, which was a worse fit found on
  // review (see STATUS-6a-figures.md).
  knee_push_up: {
    stance: 'plank',
    poseA: {
      torsoAngle: 195,
      shoulderAngle: 110,
      elbowAngle: 60,
      hipAngle: 60,
      kneeAngle: 120,
      hipOffset: { x: 0, y: 18 },
    },
    poseB: {
      torsoAngle: 215,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 60,
      kneeAngle: 120,
      hipOffset: { x: 0, y: -4 },
    },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Standing near-vertical, leaning into a wall with hands at shoulder height (wall push-up).
  wall_push_up: {
    stance: 'standing',
    poseA: { torsoAngle: 250, shoulderAngle: 350, elbowAngle: 80, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 350, hipAngle: 95, kneeAngle: 90 },
    track: 'shoulder',
    bandJoint: 'hand',
  },
  // Hanging underneath a low bar with a straight body, pulling the chest up to it (inverted
  // row) — not a standing pull, which the default horizontal_pull archetype would otherwise show
  // for this bodyweight exercise (found by rendering; the setup cue is explicit: "hang
  // underneath with a straight body").
  inverted_row: {
    stance: 'plank',
    poseA: {
      torsoAngle: 200,
      shoulderAngle: 280,
      elbowAngle: 280,
      hipAngle: 55,
      kneeAngle: 55,
      hipOffset: { x: 4, y: 26 },
    },
    poseB: {
      torsoAngle: 200,
      shoulderAngle: 250,
      elbowAngle: 210,
      hipAngle: 55,
      kneeAngle: 55,
      hipOffset: { x: 4, y: 26 },
    },
    track: 'hand',
    bandJoint: 'hand',
  },
  // High plank, one arm lifting off the ground (row / drag / shoulder-tap / up-down family) —
  // not anti_rotation's default standing press, which is wrong for every plank-* and
  // bw-plank-* exercise in this pattern (found by rendering; every one of their setup cues
  // starts "High plank..." or "From a forearm plank...").
  plank_reach: {
    stance: 'plank',
    poseA: {
      torsoAngle: 200,
      shoulderAngle: 100,
      elbowAngle: 100,
      hipAngle: 55,
      kneeAngle: 55,
      hipOffset: { x: 4, y: 26 },
    },
    poseB: {
      torsoAngle: 200,
      shoulderAngle: 210,
      elbowAngle: 250,
      hipAngle: 55,
      kneeAngle: 55,
      hipOffset: { x: 4, y: 26 },
    },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Seated, leaned back with feet hovering, rotating hands across the body (Russian twist).
  seated_twist: {
    stance: 'supine',
    poseA: {
      torsoAngle: 320,
      shoulderAngle: 300,
      elbowAngle: 300,
      hipAngle: 320,
      kneeAngle: 330,
      hipOffset: { x: 0, y: -8 },
    },
    poseB: {
      torsoAngle: 320,
      shoulderAngle: 20,
      elbowAngle: 20,
      hipAngle: 320,
      kneeAngle: 330,
      hipOffset: { x: 0, y: -8 },
    },
    track: 'hand',
    bandJoint: 'foot',
  },
  // Standing, arms sweeping from wide to together in front of the chest (chest fly) — not
  // horizontal_push's default plank, which is wrong for this pattern member (its cue is
  // "Anchor at chest height behind you," a standing motion, not a push-up).
  standing_fly: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 190, elbowAngle: 190, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 350, elbowAngle: 350, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Side-lying, the top knee opening away from the bottom one (clamshell) — not abduction's
  // default standing shape, which contradicts the "side-lying" setup cue.
  side_lying_abduction: {
    stance: 'supine',
    poseA: {
      torsoAngle: 0,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 100,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -8 },
    },
    poseB: {
      torsoAngle: 0,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 60,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -8 },
    },
    track: 'knee',
    bandJoint: 'knee',
  },
  // Lying on the back, straight arms sweeping from the chest to overhead (pullover) — not
  // vertical_pull's default standing pull.
  supine_pullover: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 340, elbowAngle: 340, hipAngle: 100, kneeAngle: 260 },
    poseB: { torsoAngle: 0, shoulderAngle: 260, elbowAngle: 260, hipAngle: 100, kneeAngle: 260 },
    track: 'hand',
    bandJoint: 'hand',
  },
  // Kneeling with heels anchored, lowering the torso forward under control (Nordic curl).
  kneeling_lean: {
    stance: 'kneeling',
    poseA: { torsoAngle: 270, shoulderAngle: 260, elbowAngle: 340, hipAngle: 15, kneeAngle: 15 },
    poseB: { torsoAngle: 230, shoulderAngle: 220, elbowAngle: 320, hipAngle: 15, kneeAngle: 15 },
    track: 'shoulder',
    bandJoint: 'hand',
  },

  // ---- crunch-family sub-variants (default `flexion` above stays the plain crunch) ----

  // Full sit-up: torso all the way to vertical.
  situp: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 20, elbowAngle: 20, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 275,
      shoulderAngle: 250,
      elbowAngle: 250,
      hipAngle: 100,
      kneeAngle: 260,
      hipOffset: { x: 10, y: -2 },
    },
    track: 'shoulder',
    bandJoint: 'foot',
  },
  // Reverse crunch: hips curl up toward the ribs, shoulders stay down.
  reverse_crunch_shape: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 350, elbowAngle: 350, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 0,
      shoulderAngle: 350,
      elbowAngle: 350,
      hipAngle: 340,
      kneeAngle: 300,
      hipOffset: { x: 0, y: -14 },
    },
    track: 'knee',
    bandJoint: 'foot',
  },
  // Straight-leg raise: legs lift together, torso stays down.
  leg_raise_shape: {
    stance: 'supine',
    // poseA's hipAngle/kneeAngle 60/60, not 95/90 — the near-vertical original pointed the
    // resting leg almost straight down from the hip and drove the foot 3.9px through the y=152
    // ground line; a shallower angle lays the straight leg out along the floor instead (round 3).
    poseA: { torsoAngle: 0, shoulderAngle: 350, elbowAngle: 350, hipAngle: 60, kneeAngle: 60 },
    poseB: { torsoAngle: 0, shoulderAngle: 350, elbowAngle: 350, hipAngle: 350, kneeAngle: 355 },
    track: 'foot',
    bandJoint: 'foot',
  },
  // V-up: torso and legs rise together to meet in the middle.
  v_up_shape: {
    stance: 'supine',
    // Same fix and reason as leg_raise_shape's poseA (round 3): 60/60, not 95/90.
    poseA: { torsoAngle: 0, shoulderAngle: 340, elbowAngle: 340, hipAngle: 60, kneeAngle: 60 },
    poseB: {
      torsoAngle: 320,
      shoulderAngle: 320,
      elbowAngle: 320,
      hipAngle: 340,
      kneeAngle: 350,
      hipOffset: { x: 0, y: -10 },
    },
    track: 'shoulder',
    bandJoint: 'foot',
  },
  // Bicycle crunch: one knee drawn in with a rotated shoulder, the other leg extended.
  bicycle_crunch_shape: {
    stance: 'supine',
    poseA: {
      torsoAngle: 0,
      shoulderAngle: 340,
      elbowAngle: 340,
      hipAngle: 90,
      kneeAngle: 260,
    },
    poseB: {
      torsoAngle: 330,
      shoulderAngle: 300,
      elbowAngle: 300,
      hipAngle: 320,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -4 },
    },
    track: 'knee',
    bandJoint: 'foot',
  },
  // Heel tap: small side-to-side torso curl, arm reaching down toward the heel.
  heel_tap_shape: {
    stance: 'supine',
    poseA: { torsoAngle: 0, shoulderAngle: 20, elbowAngle: 20, hipAngle: 100, kneeAngle: 260 },
    poseB: {
      torsoAngle: 350,
      shoulderAngle: 60,
      elbowAngle: 60,
      hipAngle: 100,
      kneeAngle: 260,
      hipOffset: { x: 0, y: -3 },
    },
    track: 'hand',
    bandJoint: 'foot',
  },
};

// ---------------------------------------------------------------------------------------------
// Per-exercise overrides — an archetype is a plurality-case default, not a universal fit. Every
// entry below was chosen by reading that exercise's `setup` cue directly (see
// STATUS-6a-figures.md for the full sweep notes, prioritizing the cd-*/wu-* stretch/mobility set
// and every large body-position collision found by geometry clustering).
// ---------------------------------------------------------------------------------------------

const REUSE_ARCHETYPE: Record<string, string> = {
  // --- flexion pattern: crunch-family variety ---
  'kneeling-crunch': 'kneeling_situp',
  'band-sit-up': 'kneeling_situp',
  'mountain-climber': 'plank_knee_drive',
  'bw-mountain-climber': 'plank_knee_drive',
  'bw-sit-up': 'situp',
  'reverse-crunch': 'reverse_crunch_shape',
  'bw-reverse-crunch': 'reverse_crunch_shape',
  'leg-raise': 'leg_raise_shape',
  'bw-leg-raise': 'leg_raise_shape',
  'banded-v-up': 'v_up_shape',
  'bw-v-up': 'v_up_shape',
  'bw-bicycle-crunch': 'bicycle_crunch_shape',
  'bw-heel-tap': 'heel_tap_shape',
  'bw-boat-hold': 'seated_boat',
  'flutter-kick': 'leg_raise_shape',
  'bw-flutter-kick': 'leg_raise_shape',

  // --- anti_extension pattern: supine subset (was wrongly forced into the kneeling->plank
  // brace shape) ---
  'dead-bug': 'flexion',
  'bw-dead-bug': 'flexion',
  'hollow-hold': 'flexion',
  'bw-hollow-hold': 'flexion',
  'cd-cobra': 'prone_extension',
  'bw-prone-ytw': 'prone_extension', // "Face down" — not the shoulder_isolation pattern's standing default
  'bw-superman': 'prone_extension',
  'cd-childs-pose': 'kneeling_fold',
  'bw-crab-walk': 'hip_extension',
  'overhead-march': 'vertical_push',
  'bw-inchworm': 'hinge',
  'bw-side-plank': 'side_plank_hold',
  'bw-side-plank-hip-dip': 'side_plank_dynamic',
  'side-plank-abduction': 'side_plank_dynamic',
  'bird-dog': 'quadruped_reach',
  'bw-bird-dog': 'quadruped_reach',
  'wu-deadbug-bw': 'quadruped_reach',

  // --- hip_extension pattern: this pattern is only correctly a supine bridge for the true
  // glute-bridge movement; the other two members of the pattern are a different body position
  // entirely (known pre-existing mistag — ORCHESTRATION.md carried-forward issue #4) ---
  tke: 'squat',
  'bw-donkey-kick': 'donkey_kick',
  // Fire hydrant (abduction pattern) is "on hands and knees," not the pattern's default standing
  // shape — reuses donkey_kick (see that shape's comment on the sagittal-view limitation this
  // shares with a true kick-back).
  'bw-fire-hydrant': 'donkey_kick',
  clamshell: 'side_lying_abduction',
  'lateral-walk': 'abduction_thigh',
  'monster-walk': 'abduction_thigh',
  'wu-lateral-walk': 'abduction_thigh',
  // Inverted row (horizontal_pull pattern) hangs underneath a bar with a straight body, not the
  // pattern's default standing pull.
  'bw-inverted-row': 'inverted_row',

  // --- hinge pattern: glute bridges were tagged `hinge` but are the supine bridge movement, not
  // a standing hinge — same class of archetype-assignment bug as the cd-* stretches below ---
  'bw-glute-bridge': 'hip_extension',
  'wu-glute-bridge': 'hip_extension',
  'bw-single-leg-glute-bridge': 'hip_extension',
  'bw-nordic-curl': 'kneeling_lean',
  'cd-figure-four': 'supine_stretch',
  'cd-hamstring-band': 'supine_stretch',

  // --- squat pattern: several members are not a plain squat at all ---
  'bw-pistol-squat': 'pistol_squat',
  'bw-jump-squat': 'jump_squat',
  'bw-broad-jump': 'broad_jump',
  'bw-jumping-jack': 'jumping_jack',
  'bw-high-knees': 'high_knees',
  'bw-squat-thrust': 'squat_to_plank',
  'banded-burpee': 'squat_to_plank',
  'bw-burpee': 'squat_to_plank',
  'bw-sprawl': 'squat_to_plank',

  // --- lunge pattern: lateral/rotational lunge variants are a genuinely different (frontal-
  // plane) movement than the forward/reverse lunge default; see lateral_lunge_shape's own
  // comment for the honest limitation this override doesn't fully solve ---
  'cd-hip-flexor': 'half_kneeling',
  'bw-step-up': 'elevated_front_step',
  'step-up': 'elevated_front_step',
  'bw-bulgarian-split-squat': 'elevated_rear_foot',
  'bulgarian-split-squat': 'elevated_rear_foot',
  'bw-lateral-lunge': 'lateral_lunge_shape',
  'bw-cossack-squat': 'lateral_lunge_shape',
  'bw-curtsy-lunge': 'lateral_lunge_shape',
  'bw-skater-jump': 'lateral_lunge_shape',
  'lateral-lunge': 'lateral_lunge_shape',

  // --- horizontal_push pattern: incline/decline/wall/knee are genuinely different body angles;
  // archer/one-arm are genuinely asymmetric; standing-chest-press/floor-press aren't a plank at
  // all (band-resisted press done standing / lying on the back) ---
  'bw-knee-push-up': 'knee_push_up',
  'bw-wall-push-up': 'wall_push_up',
  'cd-chest-stretch': 'standing_reach',
  'chest-fly': 'standing_fly',
  'high-low-fly': 'standing_fly',
  'low-high-fly': 'standing_fly',
  'standing-chest-press': 'standing_press',
  'floor-press': 'floor_press',

  // --- anti_rotation pattern ---
  'cd-thoracic-rotation': 'side_lying_rotation',
  'plank-row': 'plank_reach',
  'plank-band-drag': 'plank_reach',
  'bw-plank-shoulder-tap': 'plank_reach',
  'bw-plank-up-down': 'plank_reach',
  'russian-twist': 'seated_twist',
  'bw-russian-twist': 'seated_twist',
  'bw-windshield-wiper': 'flexion',

  // --- vertical_pull pattern ---
  'cd-lat-stretch': 'lateral_flexion',
  'bw-dead-hang': 'dead_hang',
  'floor-pullover': 'supine_pullover',

  // --- vertical_push pattern: pike push-up, bench dip, and wall handstand push-up are not a
  // standing overhead press — a bug of the same class as the horizontal_push floor-press one ---
  'half-kneeling-ohp': 'half_kneeling_press',
  'bw-pike-push-up': 'pike_push_up',
  'bw-dip': 'bench_dip',
  'bw-wall-hspu': 'handstand_press',

  // --- anti_extension pattern: cat-cow is a slow spinal undulation, not a plank brace ---
  'wu-cat-cow': 'cat_cow',

  // --- shoulder_isolation pattern: a lateral raise, a front raise, a shrug, and a bent-over fly
  // are four different movements, not one ---
  'band-shrug': 'shrug',
  'front-raise': 'front_raise',
  'reverse-fly': 'bent_over_raise',
  'bent-over-y-raise': 'bent_over_raise',

  // --- hinge pattern (further mistags of the same "supine bridge tagged hinge" class, plus
  // hinge variants that are genuinely a different finishing movement) ---
  'glute-bridge': 'hip_extension',
  'single-leg-bridge': 'hip_extension',
  'hip-thrust': 'hip_extension',
  'frog-pump': 'hip_extension',
  'glute-kickback': 'donkey_kick',
  'single-leg-rdl': 'single_leg_hinge',
  'bw-single-leg-rdl': 'single_leg_hinge',
  'deadlift-high-pull': 'hinge_to_pull',
  'clean-and-press': 'hinge_to_press',

  // --- squat pattern: a squat that finishes in a press or a chop is a different movement than
  // a plain squat ---
  'squat-jump': 'jump_squat',
  thruster: 'squat_to_press',
  'squat-to-press': 'squat_to_press',
  'squat-to-chop': 'squat_to_chop',

  // --- calf pattern ---
  'cd-calf-stretch': 'calf_wall_stretch',
};

/** Angle deltas applied on top of the resolved archetype for exercises that share their
 *  pattern's basic body position but differ in a way a small parametric nudge can show —
 *  elbow flare (hand width) or an elevated platform under a hand/foot. Declarative, so it stays
 *  auditable next to the id it applies to rather than duplicating a whole archetype. */
interface PoseTweak {
  shoulderDelta?: number;
  platformUnder?: 'hand' | 'foot';
  hipOffsetDelta?: Point;
  mirrorArm?: boolean;
}

const POSE_TWEAKS: Record<string, PoseTweak> = {
  'bw-wide-push-up': { shoulderDelta: -18 },
  'bw-diamond-push-up': { shoulderDelta: 22 },
  'bw-decline-push-up': { platformUnder: 'foot', hipOffsetDelta: { x: 0, y: -6 } },
  'bw-incline-push-up': { platformUnder: 'hand', hipOffsetDelta: { x: 0, y: 8 } },
  'bw-archer-push-up': { shoulderDelta: -12 },
  'bw-one-arm-push-up': { shoulderDelta: -8 },
};

// ---------------------------------------------------------------------------------------------
// Anchor glyphs — read per-exercise from `anchor`, not the archetype, so band position stays
// exercise-accurate even though the pose is shared with siblings in the same pattern.
// ---------------------------------------------------------------------------------------------

/** Returns the fixed anchor point (or null if the band has no external fixed point), in
 *  panel-local coordinates (before the panel's x-offset is applied). */
/** `panelX` is the panel's own left edge (LEFT_X, RIGHT_X, or HOLD_X's panel origin) — needed so
 *  a fixed-post anchor (anchor-low/mid/high) is placed relative to the panel actually being
 *  drawn, not a single hardcoded canvas position. An earlier version hardcoded a negative x that
 *  only made sense for the left panel; for the right panel it drew the post off-canvas and the
 *  band as a long stray line spanning the whole width, through the divider (found by rendering
 *  `band-sit-up` — see STATUS-6a-figures.md). */
function anchorPoint(anchor: string, rig: RigPoints, panelX: number): Point | null {
  switch (anchor) {
    case 'anchor-low':
      return { x: panelX + 18, y: 118 };
    case 'anchor-mid':
      return { x: panelX + 18, y: 80 };
    case 'anchor-high':
      return { x: panelX + 18, y: 30 };
    case 'pullup-bar':
      return { x: rig.hand.x, y: 8 };
    case 'feet':
    case 'stance':
      // Fixed to the hip's x, not the working joint's — several archetypes (squat, lunge, calf)
      // anchor the band under the feet but the tension is felt at the *hand*; tying the anchor
      // x to the working joint made the path collapse to a near-zero-length mark whenever the
      // working joint itself was the foot (Finding 5's "small stray mark" in banded-squat).
      return { x: rig.hip.x, y: 152 };
    default:
      return null; // none / self-low / thigh-loop / body-support — drawn as a loop on the body
  }
}

function anchorGlyph(anchor: string, point: Point): string {
  switch (anchor) {
    case 'pullup-bar':
      return `<line x1="${point.x - 26}" y1="${point.y}" x2="${point.x + 26}" y2="${point.y}" stroke="#334155" stroke-width="4"/>`;
    case 'anchor-low':
    case 'anchor-mid':
    case 'anchor-high':
      return (
        `<rect x="${point.x - 3}" y="8" width="6" height="144" fill="#94a3b8"/>` +
        `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="#334155"/>`
      );
    case 'feet':
    case 'stance':
      return `<path d="M ${point.x - 16} ${point.y} q 16 12 32 0" stroke="#94a3b8" stroke-width="3.5" fill="none"/>`;
    default:
      return '';
  }
}

/** A visibly band-like path — a shallow zigzag, not a thin straight line, per Finding 5. */
function bandPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const segments = Math.max(3, Math.round(dist / 14));
  const nx = -dy / dist;
  const ny = dx / dist;
  const amp = 3;
  let d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)}`;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const px = from.x + dx * t + nx * amp * (i % 2 === 0 ? 1 : -1);
    const py = from.y + dy * t + ny * amp * (i % 2 === 0 ? 1 : -1);
    d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  d += ` L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  return `<path d="${d}" stroke="#16a34a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function anchorSvg(
  exercise: Exercise,
  rig: RigPoints,
  archetype: Archetype,
  panelX: number,
): string {
  const workingJoint = rig[archetype.bandJoint];
  if (exercise.equipment === 'band') {
    const fixed = anchorPoint(exercise.anchor, rig, panelX);
    if (fixed) {
      return anchorGlyph(exercise.anchor, fixed) + bandPath(fixed, workingJoint);
    }
    // No external fixed point (none / self-low / thigh-loop / body-support): a visibly thicker
    // loop directly on the body at the working joint shows band tension without inventing an
    // anchor that doesn't exist.
    return `<ellipse cx="${workingJoint.x.toFixed(1)}" cy="${workingJoint.y.toFixed(1)}" rx="11" ry="6" fill="none" stroke="#16a34a" stroke-width="3"/>`;
  }
  // Bodyweight exercises anchored to a fixture (a pull-up bar) still need that fixture drawn —
  // a dead hang or a pull-up is unreadable without the bar, even though there's no elastic band.
  // `body-support` (a bench) is handled by `platformUnder` on the pose itself, not here.
  if (exercise.anchor === 'pullup-bar') {
    return anchorGlyph('pullup-bar', { x: workingJoint.x, y: 8 });
  }
  return '';
}

// ---------------------------------------------------------------------------------------------
// SVG assembly — two side-by-side panels (start | end) with a divider and a movement arrow, or a
// single centered panel with a pause glyph for an isometric hold (metric === 'time').
// ---------------------------------------------------------------------------------------------

const PANEL = { width: 140, gap: 20, height: 170 };
const LEFT_X = 0;
const RIGHT_X = PANEL.width + PANEL.gap;
const CANVAS_W = PANEL.width * 2 + PANEL.gap;
const CANVAS_H = PANEL.height;
const HOLD_X = (PANEL.width + PANEL.gap) / 2; // centers a single panel in the full canvas

const ARM_COLOR = '#0891b2';
const LEG_COLOR = '#7c3aed';
const TRUNK_COLOR = '#1e293b';

function translateRig(rig: RigPoints, dx: number): RigPoints {
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y });
  return {
    head: shift(rig.head),
    shoulder: shift(rig.shoulder),
    elbow: shift(rig.elbow),
    hand: shift(rig.hand),
    hip: shift(rig.hip),
    knee: shift(rig.knee),
    foot: shift(rig.foot),
  };
}

function limbPath(a: Point, b: Point, c: Point): string {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
}

function platformSvg(joint: Point): string {
  return `<rect x="${(joint.x - 16).toFixed(1)}" y="${(joint.y - 3).toFixed(1)}" width="32" height="7" rx="1.5" fill="#cbd5e1"/>`;
}

/** A bench behind the hip for a rear-foot-elevated split stance — see `benchBehindHip`'s comment
 *  on why this can't just be `platformUnder: 'foot'` (this rig only models the front leg). */
function benchBehindHipSvg(hip: Point): string {
  const x = hip.x - 46;
  const y = hip.y + 12;
  return (
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="30" height="7" rx="1.5" fill="#cbd5e1"/>` +
    `<rect x="${(x + 3).toFixed(1)}" y="${(y + 7).toFixed(1)}" width="4" height="14" fill="#cbd5e1"/>`
  );
}

/** Solid, single-opacity rig with the trunk/arm/leg visually differentiated by color and the
 *  hand/foot marked with a dot, so a superimposed or side-by-side pose reads as a body, not a
 *  tangle of same-weight lines (Finding 3 / Finding 6). */
function rigSvg(rig: RigPoints, pose: PoseAngles): string {
  const platform = pose.platformUnder
    ? platformSvg(pose.platformUnder === 'hand' ? rig.hand : rig.foot)
    : '';
  const bench = pose.benchBehindHip ? benchBehindHipSvg(rig.hip) : '';
  return (
    `<g>` +
    platform +
    bench +
    `<circle cx="${rig.head.x.toFixed(1)}" cy="${rig.head.y.toFixed(1)}" r="${LEN.headR}" fill="none" stroke="${TRUNK_COLOR}" stroke-width="3"/>` +
    // Torso: thick and dark so it reads as the trunk, distinct from both limbs.
    `<path d="M ${rig.hip.x.toFixed(1)} ${rig.hip.y.toFixed(1)} L ${rig.shoulder.x.toFixed(1)} ${rig.shoulder.y.toFixed(1)}" stroke="${TRUNK_COLOR}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    `<path d="${limbPath(rig.shoulder, rig.elbow, rig.hand)}" stroke="${ARM_COLOR}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${limbPath(rig.hip, rig.knee, rig.foot)}" stroke="${LEG_COLOR}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${rig.hand.x.toFixed(1)}" cy="${rig.hand.y.toFixed(1)}" r="2.8" fill="${ARM_COLOR}"/>` +
    `<circle cx="${rig.foot.x.toFixed(1)}" cy="${rig.foot.y.toFixed(1)}" r="2.8" fill="${LEG_COLOR}"/>` +
    `</g>`
  );
}

function movementArrow(fromY: number, toY: number): string {
  const y = (fromY + toY) / 2;
  const x1 = PANEL.width + 6;
  const x2 = PANEL.width + PANEL.gap - 6;
  return (
    `<line x1="${x1}" y1="${y.toFixed(1)}" x2="${(x2 - 6).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#b91c1c" stroke-width="2.5"/>` +
    `<path d="M ${(x2 - 6).toFixed(1)} ${(y - 4).toFixed(1)} L ${x2} ${y.toFixed(1)} L ${(x2 - 6).toFixed(1)} ${(y + 4).toFixed(1)}" fill="#b91c1c"/>`
  );
}

function holdGlyph(): string {
  // A small pause icon (two bars) in the top-right corner signals "static hold," not a rep.
  const x = CANVAS_W - 26;
  const y = 14;
  return (
    `<g>` +
    `<rect x="${x}" y="${y}" width="5" height="16" rx="1.5" fill="#64748b"/>` +
    `<rect x="${x + 9}" y="${y}" width="5" height="16" rx="1.5" fill="#64748b"/>` +
    `</g>`
  );
}

function groundLine(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#cbd5e1" stroke-width="2"/>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyTweak(pose: PoseAngles, tweak: PoseTweak | undefined): PoseAngles {
  if (!tweak) return pose;
  const next: PoseAngles = { ...pose };
  if (tweak.shoulderDelta) next.shoulderAngle = pose.shoulderAngle + tweak.shoulderDelta;
  if (tweak.platformUnder) next.platformUnder = tweak.platformUnder;
  if (tweak.hipOffsetDelta) {
    const base = pose.hipOffset ?? { x: 0, y: 0 };
    next.hipOffset = { x: base.x + tweak.hipOffsetDelta.x, y: base.y + tweak.hipOffsetDelta.y };
  }
  return next;
}

function resolveArchetype(exercise: Exercise): Archetype | undefined {
  const reuseKey = REUSE_ARCHETYPE[exercise.id];
  if (reuseKey) return SHAPES[reuseKey];
  return SHAPES[exercise.pattern];
}

function generateFigure(exercise: Exercise): string {
  const archetype = resolveArchetype(exercise);
  if (!archetype) {
    throw new Error(`No archetype for pattern "${exercise.pattern}" (exercise ${exercise.id})`);
  }
  const tweak = POSE_TWEAKS[exercise.id];
  const poseA = applyTweak(archetype.poseA, tweak);
  const poseB = applyTweak(archetype.poseB, tweak);
  const isHold = archetype.forceHold || exercise.metric === 'time';

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">`,
    `<title>${escapeXml(exercise.name)}</title>`,
  ];

  if (isHold) {
    const rig = translateRig(buildRig(archetype.stance, poseB), HOLD_X);
    parts.push(groundLine(10, CANVAS_W - 10, 152));
    // Hold layout has one panel spanning the whole canvas, so the anchor post sits near the
    // canvas's own left edge rather than a per-panel origin.
    parts.push(anchorSvg(exercise, rig, archetype, 0));
    parts.push(rigSvg(rig, poseB));
    parts.push(holdGlyph());
  } else {
    const rigA = translateRig(buildRig(archetype.stance, poseA), LEFT_X);
    const rigB = translateRig(buildRig(archetype.stance, poseB), RIGHT_X);
    parts.push(groundLine(10, PANEL.width - 10, 152));
    parts.push(groundLine(RIGHT_X + 10, CANVAS_W - 10, 152));
    parts.push(
      `<line x1="${PANEL.width + PANEL.gap / 2}" y1="10" x2="${PANEL.width + PANEL.gap / 2}" y2="162" stroke="#e2e8f0" stroke-width="2"/>`,
    );
    parts.push(anchorSvg(exercise, rigA, archetype, LEFT_X));
    parts.push(anchorSvg(exercise, rigB, archetype, RIGHT_X));
    parts.push(rigSvg(rigA, poseA));
    parts.push(rigSvg(rigB, poseB));
    parts.push(movementArrow(rigA[archetype.track].y, rigB[archetype.track].y));
  }

  parts.push(`</svg>`);
  return parts.join('');
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function main(): void {
  const exercisesRaw = fs.readFileSync(path.join(LIB_DIR, 'exercises.json'), 'utf8');
  const { exercises } = JSON.parse(exercisesRaw) as { exercises: Exercise[] };

  const figures: Record<string, string> = {};
  const errors: string[] = [];
  for (const exercise of exercises) {
    try {
      figures[exercise.id] = generateFigure(exercise);
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }

  const outPath = path.join(LIB_DIR, 'figures.json');
  fs.writeFileSync(outPath, JSON.stringify(figures, null, 2) + '\n');

  const bytes = Buffer.byteLength(fs.readFileSync(outPath));
  const distinctGeometries = new Set(
    Object.values(figures).map((svg) => svg.replace(/<title>.*?<\/title>/, '')),
  ).size;
  console.log(`Generated ${Object.keys(figures).length} figures -> ${outPath}`);
  console.log(
    `Total size: ${(bytes / 1024).toFixed(1)} KB (${(bytes / 1024 / 1024).toFixed(3)} MB)`,
  );
  console.log(
    `Distinct geometries (title-stripped): ${distinctGeometries} / ${Object.keys(figures).length}`,
  );
}

main();
