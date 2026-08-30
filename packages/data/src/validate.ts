/**
 * Hard validator for the bundled exercise library + progression families (wave-01b-content.md).
 * Exits non-zero on any problem. Run via `npm run validate:library` (packages/data or root).
 *
 * This is the deliverable that keeps the data honest — see the brief for the exact fail list.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  Exercise,
  ProgressionFamily,
  Pattern,
  Anchor,
  AnchorClass,
  Metric,
  Tier,
  Role,
  Difficulty,
  Equipment,
  Focus,
  Contraindication,
} from './schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIB_DIR = path.join(__dirname, '..', 'library');

const FOCUS_VALUES: Focus[] = ['upper', 'abs', 'legs', 'full'];
const PATTERN_VALUES: Pattern[] = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'hip_extension',
  'abduction',
  'calf',
  'anti_rotation',
  'anti_extension',
  'flexion',
  'lateral_flexion',
  'elbow_flexion',
  'elbow_extension',
  'shoulder_isolation',
];
const EQUIPMENT_VALUES: Equipment[] = ['band', 'bodyweight'];
const ANCHOR_VALUES: Anchor[] = [
  'none',
  'stance',
  'feet',
  'self-low',
  'thigh-loop',
  'body-support',
  'anchor-low',
  'anchor-mid',
  'anchor-high',
  'pullup-bar',
];
const ANCHOR_CLASS_VALUES: AnchorClass[] = ['none', 'band_tension', 'bodyweight_bearing'];
const METRIC_VALUES: Metric[] = ['reps', 'time', 'amrap'];
const TIER_VALUES: Tier[] = ['core', 'fill', 'stretch'];
const ROLE_VALUES: Role[] = ['warmup', 'main', 'cooldown'];
const DIFFICULTY_VALUES: Difficulty[] = ['easy', 'medium', 'hard'];
const CONTRA_VALUES: Contraindication[] = [
  'shoulder_overhead',
  'shoulder_horizontal',
  'elbow',
  'wrist_extension',
  'knee_flexion_loaded',
  'knee_impact',
  'hip',
  'lower_back_flexion',
  'lower_back_extension',
  'neck',
  'ankle',
  'core_pressure',
];
const LADDER_FAMILY_IDS = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'anti_extension',
];

const BODYWEIGHT_BEARING_ANCHORS: Anchor[] = ['pullup-bar', 'body-support'];

function anchorClassFor(anchor: Anchor): AnchorClass {
  if (BODYWEIGHT_BEARING_ANCHORS.includes(anchor)) return 'bodyweight_bearing';
  if (anchor === 'none') return 'none';
  return 'band_tension';
}

const errors: string[] = [];
function fail(msg: string) {
  errors.push(msg);
}

function oneOf<T>(value: unknown, allowed: T[], field: string, id: string) {
  if (!allowed.includes(value as T)) {
    fail(`${id}: invalid ${field} "${value}" (allowed: ${allowed.join(', ')})`);
  }
}

function main() {
  const exercisesRaw = fs.readFileSync(path.join(LIB_DIR, 'exercises.json'), 'utf8');
  const familiesRaw = fs.readFileSync(path.join(LIB_DIR, 'families.json'), 'utf8');
  const exercises: Exercise[] = JSON.parse(exercisesRaw).exercises;
  const families: ProgressionFamily[] = JSON.parse(familiesRaw).families;

  const byId = new Map<string, Exercise>();
  const seenIds = new Set<string>();

  for (const ex of exercises) {
    const id = ex.id;

    if (seenIds.has(id)) fail(`duplicate exercise id: ${id}`);
    seenIds.add(id);
    byId.set(id, ex);

    // bundled video_id is forbidden
    if ('video_id' in (ex as unknown as Record<string, unknown>)) {
      fail(`${id}: bundled video_id is forbidden — curated ids are remote config only (§11.4)`);
    }

    for (const f of ex.focus) oneOf(f, FOCUS_VALUES, 'focus', id);
    oneOf(ex.pattern, PATTERN_VALUES, 'pattern', id);
    oneOf(ex.equipment, EQUIPMENT_VALUES, 'equipment', id);
    oneOf(ex.anchor, ANCHOR_VALUES, 'anchor', id);
    oneOf(ex.anchor_class, ANCHOR_CLASS_VALUES, 'anchor_class', id);
    oneOf(ex.metric, METRIC_VALUES, 'metric', id);
    oneOf(ex.tier, TIER_VALUES, 'tier', id);
    oneOf(ex.role, ROLE_VALUES, 'role', id);
    oneOf(ex.difficulty, DIFFICULTY_VALUES, 'difficulty', id);
    for (const c of ex.contraindications) oneOf(c, CONTRA_VALUES, 'contraindications[]', id);

    // metric/time pairing
    if (ex.metric === 'time' && (ex.default_seconds === null || ex.default_seconds === undefined)) {
      fail(`${id}: metric=time requires default_seconds`);
    }
    if (ex.metric !== 'time' && ex.default_seconds !== null) {
      fail(`${id}: default_seconds must be null when metric is not "time"`);
    }

    // anchor_class must agree with mechanical derivation from anchor
    const expectedClass = anchorClassFor(ex.anchor);
    if (ex.anchor_class !== expectedClass) {
      fail(
        `${id}: anchor_class "${ex.anchor_class}" disagrees with anchor "${ex.anchor}" (expected "${expectedClass}")`,
      );
    }

    // band exercises need a non-null band; bodyweight needs null band
    if (ex.equipment === 'band' && (ex.band === null || ex.band === undefined || ex.band === '')) {
      fail(`${id}: equipment=band requires a non-null band`);
    }
    if (ex.equipment === 'bodyweight' && ex.band) {
      fail(`${id}: equipment=bodyweight must have a null band`);
    }

    // band exercises with anchor=none that actually need one is a judgment check we can only
    // partially automate: flag band exercises anchored at anchor-low/-mid/-high/pullup-bar with
    // anchor=none is already covered by the enum check. The inverse (falsely tagged anchor=none
    // for something that needs a fixed point) is not mechanically detectable here.

    // progression_family / progression_level_id must be both-or-neither
    if ((ex.progression_family === null) !== (ex.progression_level_id === null)) {
      fail(`${id}: progression_family and progression_level_id must both be null or both be set`);
    }

    // demo_media stub shape
    if (!ex.demo_media || ex.demo_media.type !== 'figure' || ex.demo_media.id !== id) {
      fail(`${id}: demo_media must be { type: "figure", id: "${id}" }`);
    }
  }

  // family / level referential integrity
  const seenFamilyIds = new Set<string>();
  const allLevelIds = new Set<string>();

  for (const fam of families) {
    if (seenFamilyIds.has(fam.id)) fail(`duplicate family id: ${fam.id}`);
    seenFamilyIds.add(fam.id);

    if (!LADDER_FAMILY_IDS.includes(fam.id)) {
      fail(`family ${fam.id}: not one of the 8 v1 ladder families`);
    }

    if (fam.levels.length < 6 || fam.levels.length > 9) {
      fail(`family ${fam.id}: has ${fam.levels.length} levels, expected 6-9`);
    }

    const levelIdsInFamily = new Set<string>();
    for (const lvl of fam.levels) {
      if (levelIdsInFamily.has(lvl.level_id)) {
        fail(`family ${fam.id}: duplicate level_id ${lvl.level_id} within family`);
      }
      levelIdsInFamily.add(lvl.level_id);

      if (allLevelIds.has(lvl.level_id)) {
        fail(`level_id ${lvl.level_id} is not globally unique`);
      }
      allLevelIds.add(lvl.level_id);

      const ex = byId.get(lvl.exercise_id);
      if (!ex) {
        fail(
          `family ${fam.id} level ${lvl.level_id}: references missing exercise ${lvl.exercise_id}`,
        );
        continue;
      }
      if (ex.pattern !== fam.pattern) {
        fail(
          `family ${fam.id} level ${lvl.level_id}: exercise ${ex.id} has pattern "${ex.pattern}" but family pattern is "${fam.pattern}"`,
        );
      }
      if (ex.progression_family !== fam.id) {
        fail(
          `family ${fam.id} level ${lvl.level_id}: exercise ${ex.id}.progression_family is "${ex.progression_family}", expected "${fam.id}"`,
        );
      }
      if (ex.progression_level_id !== lvl.level_id) {
        fail(
          `family ${fam.id} level ${lvl.level_id}: exercise ${ex.id}.progression_level_id is "${ex.progression_level_id}", expected "${lvl.level_id}"`,
        );
      }
    }
  }

  // every exercise carrying a progression_family must be referenced by that family's levels
  for (const ex of exercises) {
    if (ex.progression_family) {
      const fam = families.find((f) => f.id === ex.progression_family);
      if (!fam) {
        fail(`${ex.id}: progression_family "${ex.progression_family}" does not exist`);
        continue;
      }
      const inLevels = fam.levels.some((l) => l.exercise_id === ex.id);
      if (!inLevels) {
        fail(
          `${ex.id}: claims progression_family "${fam.id}" but is not in that family's levels[]`,
        );
      }
    }
  }

  for (const famId of LADDER_FAMILY_IDS) {
    if (!seenFamilyIds.has(famId)) fail(`missing required family: ${famId}`);
  }

  // §5.5 focus templates: every pattern slot needs eligible exercises per focus, and every
  // focus needs a non-empty warmup and cooldown pool.
  const TEMPLATE_PATTERNS: Record<Focus, Pattern[]> = {
    upper: [
      'horizontal_push',
      'horizontal_pull',
      'vertical_push',
      'vertical_pull',
      'elbow_flexion',
      'elbow_extension',
      'shoulder_isolation',
    ],
    legs: ['squat', 'hinge', 'lunge', 'hip_extension', 'abduction', 'calf'],
    abs: ['anti_rotation', 'flexion', 'anti_extension', 'lateral_flexion'],
    full: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'anti_extension'],
  };

  for (const focus of FOCUS_VALUES) {
    const patterns = TEMPLATE_PATTERNS[focus];
    for (const pattern of patterns) {
      const eligible = exercises.filter(
        (e) => e.role === 'main' && e.pattern === pattern && e.focus.includes(focus),
      );
      if (eligible.length === 0) {
        fail(`focus "${focus}" pattern "${pattern}": zero eligible main exercises`);
      }
    }
    const warmups = exercises.filter((e) => e.role === 'warmup' && e.focus.includes(focus));
    if (warmups.length === 0) fail(`focus "${focus}": zero eligible warmup exercises`);
    const cooldowns = exercises.filter((e) => e.role === 'cooldown' && e.focus.includes(focus));
    if (cooldowns.length === 0) fail(`focus "${focus}": zero eligible cooldown exercises`);
  }

  // ---- coverage report ----
  console.log('=== Coverage report ===');
  const countBy = <K extends string>(getKey: (e: Exercise) => K | K[]) => {
    const counts: Record<string, number> = {};
    for (const e of exercises) {
      const keys = getKey(e);
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  };
  console.log(
    'By pattern:',
    countBy((e) => e.pattern),
  );
  console.log(
    'By focus:',
    countBy((e) => e.focus),
  );
  console.log(
    'By role:',
    countBy((e) => e.role),
  );
  console.log(
    'By anchor_class:',
    countBy((e) => e.anchor_class),
  );
  console.log(
    'By tier:',
    countBy((e) => e.tier),
  );
  console.log(
    'By family level:',
    Object.fromEntries(families.map((f) => [f.id, f.levels.map((l) => l.level_id)])),
  );

  if (errors.length > 0) {
    console.error(`\n=== ${errors.length} validation error(s) ===`);
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
  console.log('\nvalidate:library OK — 0 errors.');
}

main();
