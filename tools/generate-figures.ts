/**
 * Generates the bundled in-house line-art demo figures (§11.4 tier 2) for every exercise in
 * `packages/data/library/exercises.json`.
 *
 * Composes each figure from a small set of reusable primitives rather than hand-authoring ~200
 * unique SVGs: a side-view stick-figure rig (head/torso/arm/leg, forward-kinematics from a joint
 * table), a movement-path arrow, and a band line/anchor glyph. Body pose comes from a per-
 * `pattern` archetype table (ARCHETYPES below) — the reviewable artifact a human can check against
 * `setup` cue text far faster than 200 SVG blobs. Band anchor *position* is read per-exercise from
 * that exercise's own `anchor` field, so it stays accurate even though the pose is shared.
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
  torso: 46,
  neck: 12,
  upperArm: 28,
  forearm: 26,
  upperLeg: 32,
  lowerLeg: 30,
  headR: 10,
};

/**
 * A "stance" fixes the hip (root) position and the torso-lean-independent parts of the rig
 * layout for a family of poses. Everything else (torso angle, arm angles, leg angles) is
 * supplied per-pose by the archetype.
 */
type StanceId = 'standing' | 'plank' | 'supine' | 'kneeling' | 'split';

interface StanceRoot {
  hip: Point;
}

const STANCES: Record<StanceId, StanceRoot> = {
  standing: { hip: { x: 108, y: 96 } },
  plank: { hip: { x: 130, y: 88 } },
  supine: { hip: { x: 120, y: 118 } },
  kneeling: { hip: { x: 108, y: 108 } },
  split: { hip: { x: 116, y: 96 } },
};

/**
 * One pose: full set of angles (screen-style, 0=+x/right, 90=+y/down) needed to place every
 * joint from the stance's hip root outward.
 *   torsoAngle   — direction from hip to shoulder (270 = straight up = standing tall)
 *   shoulderAngle / elbowAngle — arm, shoulder->elbow->hand
 *   hipAngle / kneeAngle       — leg, hip->knee->foot
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
  const root = STANCES[stance].hip;
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

// ---------------------------------------------------------------------------------------------
// Archetypes — one per `Pattern` enum value (packages/data/src/schema.ts). Each gives a stance,
// pose A (start) + pose B (end), which tracked joint the movement arrow follows, and which joint
// the band line attaches to.
// ---------------------------------------------------------------------------------------------

type TrackedJoint = keyof RigPoints;

interface Archetype {
  stance: StanceId;
  poseA: PoseAngles;
  poseB: PoseAngles;
  track: TrackedJoint;
  bandJoint: TrackedJoint;
}

// Angle convention throughout (screen coords, y grows downward):
//   90 = straight down, 270 = straight up, 0 = right/forward, 180 = left/backward.
// Standing baseline (verified): torsoAngle 270 (shoulder above hip), arm hanging at the side is
// shoulderAngle/elbowAngle ~100 (down, slightly forward), leg straight is hipAngle/kneeAngle ~90.

const ARCHETYPES: Record<string, Archetype> = {
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
    poseB: { torsoAngle: 270, shoulderAngle: 280, elbowAngle: 280, hipAngle: 92, kneeAngle: 88 },
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
    poseB: {
      torsoAngle: 255,
      shoulderAngle: 350,
      elbowAngle: 260,
      hipAngle: 110,
      kneeAngle: 60,
      hipOffset: { x: -6, y: 24 },
    },
    track: 'hip',
    bandJoint: 'foot',
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
    poseB: {
      torsoAngle: 265,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 115,
      kneeAngle: 55,
      hipOffset: { x: -4, y: 22 },
    },
    track: 'hip',
    bandJoint: 'foot',
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
    bandJoint: 'foot',
  },
  // Limbs together brought out to the side (lateral raise / band walk / clamshell family).
  abduction: {
    stance: 'standing',
    poseA: { torsoAngle: 270, shoulderAngle: 100, elbowAngle: 100, hipAngle: 95, kneeAngle: 90 },
    poseB: { torsoAngle: 270, shoulderAngle: 190, elbowAngle: 190, hipAngle: 95, kneeAngle: 90 },
    track: 'hand',
    bandJoint: 'foot',
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
    bandJoint: 'foot',
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
    poseA: {
      torsoAngle: 230,
      shoulderAngle: 130,
      elbowAngle: 90,
      hipAngle: 40,
      kneeAngle: 130,
    },
    poseB: {
      torsoAngle: 200,
      shoulderAngle: 110,
      elbowAngle: 110,
      hipAngle: 15,
      kneeAngle: 15,
      hipOffset: { x: 4, y: -6 },
    },
    track: 'hip',
    bandJoint: 'foot',
  },
  // Lying flat curling the torso up (crunch / sit-up / leg raise family).
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
};

// ---------------------------------------------------------------------------------------------
// Per-exercise overrides — a pattern archetype is a plurality-case default, not a universal fit.
// A handful of exercises within a pattern use a genuinely different body position than the rest
// of that pattern's members (found by reading every exercise's `setup` cue, grouped by pattern,
// during the review pass — see STATUS-6a-figures.md). Each override either reuses another
// pattern's archetype wholesale (when the body position is a close match) or supplies a bespoke
// pose (when nothing already built fits).
// ---------------------------------------------------------------------------------------------

const REUSE_ARCHETYPE: Record<string, string> = {
  // flexion pattern: default is "lying on the back, curl up" — right for every entry except:
  'kneeling-crunch': 'kneeling_situp', // "kneel facing away... crunch ribs toward hips"
  'band-sit-up': 'kneeling_situp', // upright sit-up motion, not flat-lying
  'mountain-climber': 'horizontal_push', // "in a high plank" — reuse the plank archetype
  'bw-mountain-climber': 'horizontal_push', // "High plank, drive the knees to the chest"

  // anti_extension pattern: default is "kneel, brace into a plank" — right for the plank/bear-
  // crawl/bird-dog family, wrong for the supine (on-your-back) subset:
  'dead-bug': 'flexion',
  'bw-dead-bug': 'flexion',
  'flutter-kick': 'flexion',
  'bw-flutter-kick': 'flexion',
  'hollow-hold': 'flexion',
  'bw-hollow-hold': 'flexion',
  'bw-boat-hold': 'flexion', // seated lean-back; closest existing shape is the curled supine pose
  'cd-cobra': 'hip_extension', // prone, lifting the chest — closest existing "lying, lifting" shape
  'bw-superman': 'hip_extension', // prone, lifting chest/arms/legs — same approximation
  'bw-crab-walk': 'hip_extension', // seated, hips lifted — closest existing "lying, hips lift" shape
  'overhead-march': 'vertical_push', // "press both hands overhead and hold" — arms overhead, standing
  'bw-inchworm': 'hinge', // "Hinge and walk the hands out" — the hinge-forward part is the clearest cue

  // hip_extension pattern: default is a supine glute-bridge — wrong for the standing/quadruped
  // members of this (known-mistagged per ORCHESTRATION.md carried-forward issue #4) pattern:
  tke: 'squat', // standing, knee straightens against band tension — closest existing standing leg shape
  'bw-donkey-kick': 'anti_extension', // hands and knees, kick a leg up — quadruped, not supine
};

/** Custom one-off poses for exercises no existing archetype approximates well. */
const CUSTOM_ARCHETYPES: Record<string, Archetype> = {
  kneeling_situp: {
    stance: 'kneeling',
    poseA: { torsoAngle: 260, shoulderAngle: 260, elbowAngle: 80, hipAngle: 20, kneeAngle: 130 },
    poseB: { torsoAngle: 190, shoulderAngle: 220, elbowAngle: 80, hipAngle: 20, kneeAngle: 130 },
    track: 'shoulder',
    bandJoint: 'hand',
  },
};

// ---------------------------------------------------------------------------------------------
// Anchor glyphs — read per-exercise from `anchor`, not the archetype, so band position stays
// exercise-accurate even though the pose is shared with siblings in the same pattern.
// ---------------------------------------------------------------------------------------------

/** Returns the fixed anchor point (or null if the band has no external fixed point). */
function anchorPoint(anchor: string, rig: RigPoints): Point | null {
  switch (anchor) {
    case 'anchor-low':
      return { x: 20, y: 130 };
    case 'anchor-mid':
      return { x: 20, y: 90 };
    case 'anchor-high':
      return { x: 20, y: 45 };
    case 'pullup-bar':
      return { x: rig.hand.x, y: 20 };
    case 'feet':
    case 'stance':
      return { x: rig.foot.x, y: 150 };
    default:
      return null; // none / self-low / thigh-loop / body-support — drawn as a loop on the body
  }
}

function anchorGlyph(anchor: string, point: Point): string {
  switch (anchor) {
    case 'pullup-bar':
      return `<line x1="${point.x - 30}" y1="${point.y}" x2="${point.x + 30}" y2="${point.y}" stroke="#334155" stroke-width="4"/>`;
    case 'anchor-low':
    case 'anchor-mid':
    case 'anchor-high':
      return (
        `<line x1="${point.x}" y1="10" x2="${point.x}" y2="150" stroke="#94a3b8" stroke-width="3"/>` +
        `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#334155"/>`
      );
    case 'feet':
    case 'stance':
      return `<path d="M ${point.x - 14} ${point.y} q 14 10 28 0" stroke="#94a3b8" stroke-width="3" fill="none"/>`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------------------------
// SVG assembly
// ---------------------------------------------------------------------------------------------

function limbPath(a: Point, b: Point, c: Point): string {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
}

function rigSvg(rig: RigPoints, opacity: number, color: string): string {
  return (
    `<g opacity="${opacity}">` +
    `<circle cx="${rig.head.x.toFixed(1)}" cy="${rig.head.y.toFixed(1)}" r="${LEN.headR}" fill="none" stroke="${color}" stroke-width="3"/>` +
    // Torso: thick, so it reads as the trunk rather than another limb.
    `<path d="M ${rig.hip.x.toFixed(1)} ${rig.hip.y.toFixed(1)} L ${rig.shoulder.x.toFixed(1)} ${rig.shoulder.y.toFixed(1)}" stroke="${color}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    // Arm + leg: thinner than the torso so the trunk is visually distinct at this small a size.
    `<path d="${limbPath(rig.shoulder, rig.elbow, rig.hand)}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${limbPath(rig.hip, rig.knee, rig.foot)}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    // Hand/foot dots mark the limb endpoints so they read as extremities, not open line ends.
    `<circle cx="${rig.hand.x.toFixed(1)}" cy="${rig.hand.y.toFixed(1)}" r="2.5" fill="${color}"/>` +
    `<circle cx="${rig.foot.x.toFixed(1)}" cy="${rig.foot.y.toFixed(1)}" r="2.5" fill="${color}"/>` +
    `</g>`
  );
}

function arrow(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return '';
  const ux = dx / dist;
  const uy = dy / dist;
  // Pull the arrow shaft back slightly so the arrowhead doesn't overlap the pose-B figure.
  const shaftTo = { x: from.x + dx * 0.82, y: from.y + dy * 0.82 };
  const headLen = 7;
  const spread = 0.5;
  const left = {
    x: shaftTo.x - headLen * (ux * Math.cos(spread) - uy * Math.sin(spread)),
    y: shaftTo.y - headLen * (uy * Math.cos(spread) + ux * Math.sin(spread)),
  };
  const right = {
    x: shaftTo.x - headLen * (ux * Math.cos(-spread) - uy * Math.sin(-spread)),
    y: shaftTo.y - headLen * (uy * Math.cos(-spread) + ux * Math.sin(-spread)),
  };
  return (
    `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${shaftTo.x.toFixed(1)}" y2="${shaftTo.y.toFixed(1)}" stroke="#b91c1c" stroke-width="2" stroke-dasharray="3,2"/>` +
    `<path d="M ${shaftTo.x.toFixed(1)} ${shaftTo.y.toFixed(1)} L ${left.x.toFixed(1)} ${left.y.toFixed(1)} M ${shaftTo.x.toFixed(1)} ${shaftTo.y.toFixed(1)} L ${right.x.toFixed(1)} ${right.y.toFixed(1)}" stroke="#b91c1c" stroke-width="2" fill="none" stroke-linecap="round"/>`
  );
}

function bandLine(
  exercise: Exercise,
  rigA: RigPoints,
  rigB: RigPoints,
  archetype: Archetype,
): string {
  if (exercise.equipment !== 'band') return '';
  const workingJoint = rigB[archetype.bandJoint];
  const fixed = anchorPoint(exercise.anchor, rigB);
  if (fixed) {
    return (
      anchorGlyph(exercise.anchor, fixed) +
      `<line x1="${fixed.x.toFixed(1)}" y1="${fixed.y.toFixed(1)}" x2="${workingJoint.x.toFixed(1)}" y2="${workingJoint.y.toFixed(1)}" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="1,3"/>`
    );
  }
  // No external fixed point (none / self-low / thigh-loop / body-support): draw a small loop
  // on the body itself at the working joint to show band tension without inventing an anchor.
  return `<ellipse cx="${workingJoint.x.toFixed(1)}" cy="${workingJoint.y.toFixed(1)}" rx="9" ry="5" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="1,3"/>`;
}

function resolveArchetype(exercise: Exercise): Archetype {
  const reuseKey = REUSE_ARCHETYPE[exercise.id];
  if (reuseKey) {
    return ARCHETYPES[reuseKey] ?? CUSTOM_ARCHETYPES[reuseKey];
  }
  return ARCHETYPES[exercise.pattern];
}

function generateFigure(exercise: Exercise): string {
  const archetype = resolveArchetype(exercise);
  if (!archetype) {
    throw new Error(`No archetype for pattern "${exercise.pattern}" (exercise ${exercise.id})`);
  }
  const rigA = buildRig(archetype.stance, archetype.poseA);
  const rigB = buildRig(archetype.stance, archetype.poseB);

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160">`,
    `<title>${escapeXml(exercise.name)}</title>`,
    `<line x1="8" y1="150" x2="232" y2="150" stroke="#cbd5e1" stroke-width="2"/>`,
    bandLine(exercise, rigA, rigB, archetype),
    rigSvg(rigA, 0.55, '#94a3b8'),
    rigSvg(rigB, 1, '#1e293b'),
    arrow(rigA[archetype.track], rigB[archetype.track]),
    `</svg>`,
  ];
  return parts.join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  console.log(`Generated ${Object.keys(figures).length} figures -> ${outPath}`);
  console.log(
    `Total size: ${(bytes / 1024).toFixed(1)} KB (${(bytes / 1024 / 1024).toFixed(3)} MB)`,
  );
}

main();
