/**
 * ADR 0010 — one-shot authoring helper. Adds sibling exercises to ladder levels and writes the
 * matching `progression_family` / `progression_level_id` back onto each exercise, keeping
 * `validate.ts`'s bidirectional check satisfied. Idempotent: re-running with the same map is a
 * no-op. Kept in the repo so the next person to widen a ladder can see exactly what was done.
 *
 *   node scripts/apply_siblings.js
 *
 * Siblings are chosen to match the anchor's difficulty and its `metric` (a hard requirement —
 * a level cannot be half reps and half holds). Band range and equipment may differ; the
 * prescription stage clamps `micro.band` into whatever range the chosen sibling was authored for.
 */
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'library');

/** level_id -> sibling exercise ids to add alongside the existing anchor. */
const SIBLINGS = {
  // --- horizontal_push: 8 spare core exercises, mostly band presses and flys ---
  'horizontal_push.l1': ['standing-chest-press'],
  'horizontal_push.l2': ['floor-press'],
  'horizontal_push.l3': ['chest-fly'],
  'horizontal_push.l4': ['bw-wide-push-up', 'single-arm-chest-press'],
  'horizontal_push.l5': ['low-high-fly', 'high-low-fly'],
  'horizontal_push.l6': ['close-grip-push-up'],

  // --- horizontal_pull: only 2 spares; both go to levels a user actually sits at ---
  'horizontal_pull.l1': ['overhead-pull-apart'],
  'horizontal_pull.l3': ['face-pull'],

  // --- squat: only 2 spares, both `hard`, so they pair with the jump-squat rung ---
  'squat.l6': ['squat-jump', 'bw-broad-jump'],

  // --- hinge: the deepest spare pool in the library ---
  'hinge.l1': ['glute-kickback'],
  'hinge.l2': ['glute-bridge', 'frog-pump'],
  'hinge.l3': ['good-morning', 'hip-thrust'],
  'hinge.l4': ['band-swing'],
  'hinge.l5': ['bw-single-leg-rdl', 'bw-single-leg-glute-bridge'],
  'hinge.l6': ['single-leg-bridge'],

  // --- lunge ---
  'lunge.l2': ['reverse-lunge'],
  'lunge.l3': ['bw-curtsy-lunge'],
  'lunge.l4': ['bw-lateral-lunge'],
  'lunge.l5': ['bw-step-up'],
  'lunge.l6': ['bw-bulgarian-split-squat'],

  // --- anti_extension: metric splits this ladder. l1/l2 are reps, l3+ are timed holds, and a
  //     sibling must match. That is why the timed rungs get so few. ---
  'anti_extension.l1': ['dead-bug', 'bw-flutter-kick', 'bw-superman'],
  'anti_extension.l2': ['bird-dog', 'flutter-kick', 'overhead-march'],
  'anti_extension.l5': ['bw-side-plank-hip-dip', 'bw-boat-hold'],
  'anti_extension.l7': ['hollow-hold'],
};

const exPath = path.join(LIB, 'exercises.json');
const famPath = path.join(LIB, 'families.json');
const exDoc = JSON.parse(fs.readFileSync(exPath, 'utf8'));
const famDoc = JSON.parse(fs.readFileSync(famPath, 'utf8'));
const byId = new Map(exDoc.exercises.map((e) => [e.id, e]));

let added = 0;
for (const fam of famDoc.families) {
  for (const level of fam.levels) {
    const siblings = SIBLINGS[level.level_id];
    if (!siblings) continue;
    const anchor = byId.get(level.anchor_exercise_id);
    for (const id of siblings) {
      const ex = byId.get(id);
      if (!ex) throw new Error(`${level.level_id}: unknown exercise ${id}`);
      if (ex.pattern !== fam.pattern) {
        throw new Error(`${id}: pattern ${ex.pattern} != family ${fam.pattern}`);
      }
      if (ex.metric !== anchor.metric) {
        throw new Error(`${id}: metric ${ex.metric} != anchor ${anchor.id} ${anchor.metric}`);
      }
      if (ex.role !== 'main') throw new Error(`${id}: role ${ex.role}, must be main`);
      if (ex.tier === 'fill') throw new Error(`${id}: tier fill is not a ladder rung`);
      if (ex.progression_family && ex.progression_level_id !== level.level_id) {
        throw new Error(`${id}: already on level ${ex.progression_level_id}`);
      }
      if (!level.exercise_ids.includes(id)) {
        level.exercise_ids.push(id);
        added++;
      }
      ex.progression_family = fam.id;
      ex.progression_level_id = level.level_id;
    }
  }
}

fs.writeFileSync(exPath, JSON.stringify(exDoc, null, 2) + '\n');
fs.writeFileSync(famPath, JSON.stringify(famDoc, null, 2) + '\n');
console.log(`apply_siblings: added ${added} sibling assignments`);
