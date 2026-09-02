/**
 * ADR 0010 — one-shot authoring helper for the ladder levels the existing library could not
 * cover. `vertical_push` and `vertical_pull` had zero unused `role: main, tier: core` exercises,
 * and `squat` / `anti_extension` had none at their calibration-start (l3) rung — which is exactly
 * where a cold-start user sits, and exactly the "my workout is always the same" complaint.
 *
 *   node scripts/add_sibling_exercises.js
 *
 * Idempotent: an exercise id already present is left alone, and a level already listing it is
 * not appended to twice.
 *
 * Anchor choices are deliberate. `pullup-bar` and `body-support` are NOT in
 * DEFAULT_ANCHORS_AVAILABLE, so anything tagged with them is hard-filtered away for a default
 * user; every exercise added here uses an anchor a default user actually has (`none`, `stance`,
 * `self-low`, `anchor-high`, `low-bar`).
 */
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'library');

function bandSearch(name) {
  return `https://www.youtube.com/results?search_query=loop+resistance+band+${name.replace(/ /g, '+')}+proper+form+tutorial`;
}
function bwSearch(name) {
  return `https://www.youtube.com/results?search_query=${name.replace(/ /g, '+')}+proper+form+tutorial`;
}

function band(o) {
  return {
    id: o.id,
    name: o.name,
    aliases: o.aliases ?? [],
    focus: o.focus,
    pattern: o.pattern,
    primary: o.primary,
    secondary: o.secondary,
    equipment: 'band',
    band: o.band,
    anchor: o.anchor,
    anchor_class: o.anchor === 'none' ? 'none' : 'band_tension',
    unilateral: o.unilateral ?? false,
    metric: o.metric ?? 'reps',
    default_seconds: o.metric === 'time' ? (o.default_seconds ?? 30) : null,
    tier: 'core',
    role: 'main',
    difficulty: o.difficulty,
    progression_family: o.family,
    progression_level_id: o.level,
    contraindications: o.contraindications,
    setup: o.setup,
    video_search: bandSearch(o.name),
  };
}

function bw(o) {
  const bearing = o.anchor === 'pullup-bar' || o.anchor === 'body-support' || o.anchor === 'low-bar';
  return {
    id: o.id,
    name: o.name,
    aliases: o.aliases ?? [],
    focus: o.focus,
    pattern: o.pattern,
    primary: o.primary,
    secondary: o.secondary,
    equipment: 'bodyweight',
    band: null,
    anchor: o.anchor,
    anchor_class: bearing ? 'bodyweight_bearing' : o.anchor === 'none' ? 'none' : 'band_tension',
    unilateral: o.unilateral ?? false,
    metric: o.metric ?? 'reps',
    default_seconds: o.metric === 'time' ? (o.default_seconds ?? 30) : null,
    tier: 'core',
    role: 'main',
    difficulty: o.difficulty,
    progression_family: o.family,
    progression_level_id: o.level,
    contraindications: o.contraindications,
    setup: o.setup,
    video_search: bwSearch(o.name),
  };
}

const NEW = [
  // ---------------------------------------------------------------- vertical_push (0 spares)
  band({
    id: 'seated-ohp',
    name: 'Seated Band Overhead Press',
    focus: ['upper'],
    pattern: 'vertical_push',
    primary: ['front_delts'],
    secondary: ['triceps', 'upper_back'],
    band: 'B2-B3',
    anchor: 'self-low',
    difficulty: 'medium',
    family: 'vertical_push',
    level: 'vertical_push.l1',
    contraindications: ['shoulder_overhead'],
    setup: 'Sit tall with legs straight, band under your seat, ends at shoulder height. Press straight overhead without leaning back.',
  }),
  band({
    id: 'tall-kneeling-ohp',
    name: 'Tall-Kneeling Overhead Press',
    focus: ['upper', 'abs'],
    pattern: 'vertical_push',
    primary: ['front_delts'],
    secondary: ['triceps', 'abs'],
    band: 'B1-B2',
    anchor: 'self-low',
    difficulty: 'medium',
    family: 'vertical_push',
    level: 'vertical_push.l2',
    contraindications: ['shoulder_overhead'],
    setup: 'Kneel upright on both knees with the band under your shins. Squeeze glutes and press overhead, ribs down, no arching.',
  }),
  band({
    id: 'banded-arnold-press',
    name: 'Banded Arnold Press',
    focus: ['upper'],
    pattern: 'vertical_push',
    primary: ['front_delts'],
    secondary: ['side_delts', 'triceps'],
    band: 'B1-B2',
    anchor: 'stance',
    difficulty: 'medium',
    family: 'vertical_push',
    level: 'vertical_push.l3',
    contraindications: ['shoulder_overhead'],
    setup: 'Stand mid-band, palms facing you at chest height. Rotate palms out as you press overhead, reverse on the way down.',
  }),
  band({
    id: 'banded-push-press',
    name: 'Banded Push Press',
    focus: ['upper', 'full'],
    pattern: 'vertical_push',
    primary: ['front_delts'],
    secondary: ['triceps', 'quads'],
    band: 'B2-B3',
    anchor: 'stance',
    difficulty: 'medium',
    family: 'vertical_push',
    level: 'vertical_push.l4',
    contraindications: ['shoulder_overhead'],
    setup: 'Stand mid-band, hands at shoulders. Dip a few inches at the knees and drive the band overhead, finishing with straight arms.',
  }),
  bw({
    id: 'bw-elevated-pike-push-up',
    name: 'Elevated Pike Push-Up',
    focus: ['upper'],
    pattern: 'vertical_push',
    primary: ['front_delts'],
    secondary: ['triceps', 'upper_back'],
    anchor: 'none',
    difficulty: 'hard',
    family: 'vertical_push',
    level: 'vertical_push.l5',
    contraindications: ['shoulder_overhead', 'wrist_extension'],
    setup: 'Feet on a step or low bench, hips high in an inverted V. Lower the crown of your head toward the floor, then press back up.',
  }),

  // ---------------------------------------------------------------- vertical_pull (0 spares)
  bw({
    id: 'bw-low-bar-hang',
    name: 'Low-Bar Hang',
    focus: ['upper'],
    pattern: 'vertical_pull',
    primary: ['lats'],
    secondary: ['forearms', 'upper_back'],
    anchor: 'low-bar',
    metric: 'time',
    default_seconds: 30,
    difficulty: 'easy',
    family: 'vertical_pull',
    level: 'vertical_pull.l1',
    contraindications: ['shoulder_overhead'],
    setup: 'Grip a waist-height bar and walk your feet forward until your arms take some weight. Hang back with straight arms. Time-based.',
  }),
  // ADR 0012 — with the cold start moved to level 1, vertical_pull.l1 became every new user's
  // first pull, and both its exercises (bw-dead-hang on `pullup-bar`, bw-low-bar-hang on
  // `low-bar`) need a bar. A user with neither gets a permanent PATTERN GAP, because
  // resolveLadderSlot can only walk *down* and there is nothing below l1. This is the band
  // option that makes the bottom rung reachable with no fixed point but an overhead anchor.
  band({
    id: 'banded-lat-pull-hold',
    name: 'Banded Lat Pull Hold',
    focus: ['upper'],
    pattern: 'vertical_pull',
    primary: ['lats'],
    secondary: ['rear_delts', 'biceps'],
    band: 'B1-B2',
    anchor: 'anchor-high',
    metric: 'time',
    default_seconds: 30,
    difficulty: 'easy',
    family: 'vertical_pull',
    level: 'vertical_pull.l1',
    contraindications: ['shoulder_overhead'],
    setup: 'Anchor the band high, hold both ends and pull down to chest height. Hold that position, shoulders down and back. Time-based.',
  }),
  band({
    id: 'prone-band-pulldown',
    name: 'Prone Band Pulldown',
    focus: ['upper'],
    pattern: 'vertical_pull',
    primary: ['lats'],
    secondary: ['rear_delts', 'upper_back'],
    band: 'B1-B2',
    anchor: 'self-low',
    difficulty: 'medium',
    family: 'vertical_pull',
    level: 'vertical_pull.l2',
    contraindications: ['shoulder_overhead'],
    setup: 'Lie face down holding the band wide overhead. Pull the band down toward your upper back, lifting your chest slightly.',
  }),
  band({
    id: 'single-arm-pulldown',
    name: 'Single-Arm Band Pulldown',
    focus: ['upper'],
    pattern: 'vertical_pull',
    primary: ['lats'],
    secondary: ['biceps', 'obliques'],
    band: 'B1-B2',
    anchor: 'anchor-high',
    unilateral: true,
    difficulty: 'medium',
    family: 'vertical_pull',
    level: 'vertical_pull.l3',
    contraindications: ['shoulder_overhead'],
    setup: 'Anchor the band overhead and hold one end. Pull your elbow down to your ribs, keeping the torso still.',
  }),
  band({
    id: 'kneeling-lat-pulldown',
    name: 'Kneeling Band Lat Pulldown',
    focus: ['upper'],
    pattern: 'vertical_pull',
    primary: ['lats'],
    secondary: ['biceps', 'upper_back'],
    band: 'B2-B3',
    anchor: 'anchor-high',
    difficulty: 'medium',
    family: 'vertical_pull',
    level: 'vertical_pull.l4',
    contraindications: ['shoulder_overhead'],
    setup: 'Kneel below an overhead anchor, both hands on the band. Pull down and out to your collarbones, elbows driving to your sides.',
  }),

  // ---------------------------------------------------------------- squat (no l2/l3 spares)
  bw({
    id: 'bw-tempo-squat',
    name: 'Tempo Bodyweight Squat',
    focus: ['legs'],
    pattern: 'squat',
    primary: ['quads'],
    secondary: ['glutes', 'abs'],
    anchor: 'none',
    difficulty: 'easy',
    family: 'squat',
    level: 'squat.l2',
    contraindications: ['knee_flexion_loaded'],
    setup: 'Bodyweight squat taking three slow seconds to descend, then stand normally. Chest up, knees tracking over the toes.',
  }),
  band({
    id: 'banded-sumo-squat',
    name: 'Banded Sumo Squat',
    focus: ['legs'],
    pattern: 'squat',
    primary: ['quads'],
    secondary: ['glutes', 'adductors'],
    band: 'B2-B3',
    anchor: 'stance',
    difficulty: 'easy',
    family: 'squat',
    level: 'squat.l3',
    contraindications: ['knee_flexion_loaded'],
    setup: 'Stand mid-band with a wide stance, toes turned out, hands at chest. Squat straight down between your heels.',
  }),
  band({
    id: 'banded-pause-squat',
    name: 'Banded Pause Squat',
    focus: ['legs'],
    pattern: 'squat',
    primary: ['quads'],
    secondary: ['glutes', 'abs'],
    band: 'B2-B3',
    anchor: 'stance',
    difficulty: 'easy',
    family: 'squat',
    level: 'squat.l3',
    contraindications: ['knee_flexion_loaded'],
    setup: 'Stand mid-band, hands at chest. Squat down, hold the bottom for two seconds without relaxing, then stand.',
  }),

  // ------------------------------------------------------- anti_extension (no timed l3 spares)
  bw({
    id: 'bw-high-plank',
    name: 'High Plank',
    focus: ['abs'],
    pattern: 'anti_extension',
    primary: ['abs'],
    secondary: ['front_delts', 'glutes'],
    anchor: 'none',
    metric: 'time',
    default_seconds: 30,
    difficulty: 'easy',
    family: 'anti_extension',
    level: 'anti_extension.l3',
    contraindications: ['core_pressure', 'wrist_extension'],
    setup: 'Hands under shoulders, arms straight, body in one line from heels to head. Squeeze glutes, ribs down. Time-based.',
  }),
  bw({
    id: 'bw-bear-hold',
    name: 'Bear Hold',
    focus: ['abs'],
    pattern: 'anti_extension',
    primary: ['abs'],
    secondary: ['front_delts', 'quads'],
    anchor: 'none',
    metric: 'time',
    default_seconds: 30,
    difficulty: 'easy',
    family: 'anti_extension',
    level: 'anti_extension.l3',
    contraindications: ['core_pressure', 'wrist_extension'],
    setup: 'On hands and knees, toes tucked, knees hovering an inch off the floor. Keep a flat back and breathe. Time-based.',
  }),
];

const exPath = path.join(LIB, 'exercises.json');
const famPath = path.join(LIB, 'families.json');
const exDoc = JSON.parse(fs.readFileSync(exPath, 'utf8'));
const famDoc = JSON.parse(fs.readFileSync(famPath, 'utf8'));
const existing = new Set(exDoc.exercises.map((e) => e.id));

let addedExercises = 0;
let addedLevels = 0;
for (const ex of NEW) {
  if (!existing.has(ex.id)) {
    exDoc.exercises.push(ex);
    existing.add(ex.id);
    addedExercises++;
  }
  const fam = famDoc.families.find((f) => f.id === ex.progression_family);
  if (!fam) throw new Error(`${ex.id}: unknown family ${ex.progression_family}`);
  const level = fam.levels.find((l) => l.level_id === ex.progression_level_id);
  if (!level) throw new Error(`${ex.id}: unknown level ${ex.progression_level_id}`);
  if (!level.exercise_ids.includes(ex.id)) {
    level.exercise_ids.push(ex.id);
    addedLevels++;
  }
}

fs.writeFileSync(exPath, JSON.stringify(exDoc, null, 2) + '\n');
fs.writeFileSync(famPath, JSON.stringify(famDoc, null, 2) + '\n');
console.log(`add_sibling_exercises: ${addedExercises} exercises, ${addedLevels} level assignments`);
