/**
 * Human labels for every value the Field Guide's filters offer. The library's identifiers are
 * snake/kebab-cased for the engine's benefit and nothing in them is worth showing a user raw, so
 * each dimension has an explicit map here rather than a `formatToken` fall-through; a test asserts
 * every value present in the bundled library has an entry, so a new value can't silently ship as
 * "Anchor mid".
 *
 * Anchor wording reuses `equipment.ts` (Generate's checklist) so the same fixed point has one name
 * across the app; the band-held-by-your-body anchors take their phrasing from the glossary.
 */
import type { Anchor, Difficulty, Equipment, Pattern } from '@roamfit/data';
import { ANCHOR_GROUPS } from './equipment';
import { DIFFICULTY_LABELS, FOCUS_LABELS } from './focusLabels';

/** Primary-muscle ids (free strings in the schema) to plain names. */
export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  front_delts: 'Front shoulders',
  side_delts: 'Side shoulders',
  rear_delts: 'Rear shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  upper_back: 'Upper back',
  lats: 'Lats',
  traps: 'Traps',
  lower_back: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  hip_flexors: 'Hip flexors',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  abductors: 'Outer hips',
  adductors: 'Inner thighs',
  calves: 'Calves',
};

export const PATTERN_LABELS: Record<Pattern, string> = {
  horizontal_push: 'Push forward (presses)',
  vertical_push: 'Push overhead',
  shoulder_isolation: 'Shoulder raises',
  horizontal_pull: 'Pull in (rows)',
  vertical_pull: 'Pull down (pull-ups)',
  elbow_flexion: 'Curls',
  elbow_extension: 'Triceps extensions',
  squat: 'Squat',
  lunge: 'Lunge',
  hinge: 'Hinge (hips back)',
  hip_extension: 'Hip extension',
  knee_flexion: 'Hamstring curls',
  knee_extension: 'Leg extensions',
  abduction: 'Legs out to the side',
  adduction: 'Legs in to the middle',
  calf: 'Calf raises',
  anti_rotation: 'Resist twisting',
  anti_extension: 'Resist arching (planks)',
  flexion: 'Crunches and curl-ups',
  lateral_flexion: 'Side bends',
  conditioning: 'Cardio',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  band: 'Resistance band',
  bodyweight: 'Bodyweight',
};

const BAND_ANCHOR_HEIGHT: Partial<Record<Anchor, string>> = {
  'anchor-low': 'ankle height',
  'anchor-mid': 'waist to chest height',
  'anchor-high': 'above head height',
};

const BODY_HELD_ANCHORS: Partial<Record<Anchor, string>> = {
  none: 'Nothing to set up',
  stance: 'Band under your feet',
  feet: 'Band around your feet',
  'self-low': 'Band held low by your body',
  'thigh-loop': 'Band around your thighs',
};

/** Anchor -> label, built from Generate's checklist wording plus the heights its hints name. */
export const ANCHOR_LABELS: Record<Anchor, string> = (() => {
  const fromChecklist = Object.fromEntries(
    ANCHOR_GROUPS.flatMap((g) => g.anchors).map((a) => {
      const height = BAND_ANCHOR_HEIGHT[a.value];
      return [a.value, height ? `${a.label}, ${height}` : a.label];
    }),
  );
  return { ...BODY_HELD_ANCHORS, ...fromChecklist } as Record<Anchor, string>;
})();

export const LATERALITY_LABELS: Record<string, string> = {
  bilateral: 'Both sides together',
  unilateral: 'One side at a time',
};

const DIMENSION_LABELS = {
  focus: FOCUS_LABELS as Record<string, string>,
  primary: MUSCLE_LABELS,
  pattern: PATTERN_LABELS as Record<string, string>,
  equipment: EQUIPMENT_LABELS as Record<string, string>,
  anchor: ANCHOR_LABELS as Record<string, string>,
  laterality: LATERALITY_LABELS,
  difficulty: DIFFICULTY_LABELS as Record<Difficulty, string>,
} as const;

export type LabelledKey = keyof typeof DIMENSION_LABELS;

/** The label for one filter value. Throws-free: an unmapped value (which the library test
 *  forbids) would show its raw id rather than crash the sheet. */
export function filterValueLabel(key: LabelledKey, value: string): string {
  return (DIMENSION_LABELS[key] as Record<string, string>)[value] ?? value;
}
