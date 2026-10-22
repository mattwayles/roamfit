/**
 * Groupings for the Field Guide's filter sheet: 20 muscles collapse into 8 body areas and 21
 * movement patterns into 8 families, so the sheet opens on a handful of chips and only expands to
 * the full vocabulary on request. Pure data and helpers; the screen only renders them.
 *
 * Every library value belongs to exactly one group (a test asserts it against the bundled
 * library). Groups only ever narrow to the members the library actually has (`available`), so a
 * group chip can't promise a muscle nothing trains.
 *
 * Selection semantics are unchanged from the flat chips: the filter state still holds individual
 * muscles / patterns, OR'd within the dimension. Selecting a group is shorthand for selecting all
 * its members, so the result is identical to tapping each one.
 */
import type { ExerciseFilterState } from './exerciseCatalog';
import { filterValueLabel } from './filterLabels';
import { DIFFICULTY_LABELS } from './focusLabels';

export interface FilterGroup {
  id: string;
  label: string;
  members: readonly string[];
}

/**
 * Body area. Hip flexors sit with Legs (they are what the thigh-lifting moves train), lower back
 * with Back, and Calves stand alone because calf raises are their own thing to look for.
 */
export const MUSCLE_GROUPS: readonly FilterGroup[] = [
  { id: 'chest', label: 'Chest', members: ['chest'] },
  { id: 'shoulders', label: 'Shoulders', members: ['front_delts', 'side_delts', 'rear_delts'] },
  { id: 'back', label: 'Back', members: ['upper_back', 'lats', 'traps', 'lower_back'] },
  { id: 'arms', label: 'Arms', members: ['biceps', 'triceps', 'forearms'] },
  { id: 'core', label: 'Core', members: ['abs', 'obliques'] },
  { id: 'glutes', label: 'Glutes', members: ['glutes'] },
  {
    id: 'legs',
    label: 'Legs',
    members: ['quads', 'hamstrings', 'hip_flexors', 'abductors', 'adductors'],
  },
  { id: 'calves', label: 'Calves', members: ['calves'] },
];

/**
 * Movement families. The compound lifts keep their familiar names; single-joint patterns (curls,
 * triceps extensions, shoulder raises, calf raises, leg extension/curl, hips out/in) have no
 * natural compound home, so they share an "Isolation" family rather than being scattered across
 * Push/Pull/Squat/Hinge where a user wouldn't look for them.
 */
export const PATTERN_FAMILIES: readonly FilterGroup[] = [
  { id: 'push', label: 'Push', members: ['horizontal_push', 'vertical_push'] },
  { id: 'pull', label: 'Pull', members: ['horizontal_pull', 'vertical_pull'] },
  { id: 'squat', label: 'Squat', members: ['squat'] },
  { id: 'hinge', label: 'Hinge', members: ['hinge', 'hip_extension'] },
  { id: 'lunge', label: 'Lunge', members: ['lunge'] },
  {
    id: 'core',
    label: 'Core',
    members: ['anti_rotation', 'anti_extension', 'flexion', 'lateral_flexion'],
  },
  { id: 'cardio', label: 'Cardio', members: ['conditioning'] },
  {
    id: 'isolation',
    label: 'Isolation',
    members: [
      'shoulder_isolation',
      'elbow_flexion',
      'elbow_extension',
      'knee_flexion',
      'knee_extension',
      'abduction',
      'adduction',
      'calf',
    ],
  },
];

export type GroupSelection = 'none' | 'partial' | 'all';

/** The group's members that the library actually has, in the group's own order. */
export function availableMembers(group: FilterGroup, available: readonly string[]): string[] {
  return group.members.filter((m) => available.includes(m));
}

export function groupSelection(
  group: FilterGroup,
  selected: readonly string[],
  available: readonly string[],
): GroupSelection {
  const members = availableMembers(group, available);
  const chosen = members.filter((m) => selected.includes(m)).length;
  if (chosen === 0) return 'none';
  return chosen === members.length ? 'all' : 'partial';
}

/** Group chip tap: everything on unless everything is already on, in which case everything off.
 *  A partly-selected group fills up first — the less surprising of the two readings. */
export function toggleGroup(
  group: FilterGroup,
  selected: readonly string[],
  available: readonly string[],
): string[] {
  const members = availableMembers(group, available);
  if (groupSelection(group, selected, available) === 'all') {
    return selected.filter((v) => !members.includes(v));
  }
  return [...selected, ...members.filter((m) => !selected.includes(m))];
}

export interface SelectionChip {
  id: string;
  label: string;
  /** The raw values this chip stands for; removing the chip deselects all of them. */
  values: string[];
}

/** A selection as the fewest sensible chips: a fully-selected group is one chip under the group's
 *  name, anything else is its individual values. Order follows the groups, so it is stable. */
export function selectionChips(
  groups: readonly FilterGroup[],
  selected: readonly string[],
  available: readonly string[],
  labelFor: (value: string) => string,
): SelectionChip[] {
  const out: SelectionChip[] = [];
  const claimed = new Set<string>();
  for (const group of groups) {
    const members = availableMembers(group, available);
    const chosen = members.filter((m) => selected.includes(m));
    if (chosen.length === 0) continue;
    chosen.forEach((m) => claimed.add(m));
    if (chosen.length === members.length) {
      out.push({ id: `group-${group.id}`, label: group.label, values: chosen });
    } else {
      chosen.forEach((m) => out.push({ id: m, label: labelFor(m), values: [m] }));
    }
  }
  selected
    .filter((v) => !claimed.has(v))
    .forEach((v) => out.push({ id: v, label: labelFor(v), values: [v] }));
  return out;
}

/** "Any" for nothing, else the labels joined with a dot, the tail folded into "+N" past `max`. */
export function summarizeLabels(labels: readonly string[], max = 2): string {
  if (labels.length === 0) return 'Any';
  if (labels.length <= max) return labels.join(' · ');
  return `${labels.slice(0, max).join(' · ')} · +${labels.length - max}`;
}

export type FilterSectionId = 'works' | 'moves' | 'need' | 'fit';

export const FILTER_SECTION_TITLES: Record<FilterSectionId, string> = {
  works: 'What it works',
  moves: 'How it moves',
  need: 'What you need',
  fit: 'Your fit',
};

export const FILTER_SECTION_ORDER: readonly FilterSectionId[] = ['works', 'moves', 'need', 'fit'];

/** Only the first section is open the first time the sheet is shown. */
export const DEFAULT_OPEN_SECTIONS: Record<FilterSectionId, boolean> = {
  works: true,
  moves: false,
  need: false,
  fit: false,
};

const PERFORMED_SUMMARY = { performed: 'Done', never: 'Not yet' } as const;

/** The one-line "what's selected" shown on a closed section header. */
export function sectionSummaries(
  state: ExerciseFilterState,
  options: { primary: readonly string[]; pattern: readonly string[] },
): Record<FilterSectionId, string> {
  const labelled = (key: Parameters<typeof filterValueLabel>[0], values: readonly string[]) =>
    values.map((v) => filterValueLabel(key, v));

  const works = [
    ...labelled('focus', state.focus),
    ...selectionChips(MUSCLE_GROUPS, state.primary, options.primary, (v) =>
      filterValueLabel('primary', v),
    ).map((c) => c.label),
  ];
  const moves = selectionChips(PATTERN_FAMILIES, state.pattern, options.pattern, (v) =>
    filterValueLabel('pattern', v),
  ).map((c) => c.label);
  const need = [
    ...(state.noGear ? ['No gear'] : []),
    ...(state.equipment.includes('band') ? ['Band'] : []),
    ...labelled('anchor', state.anchor),
  ];
  const fit = [
    ...state.difficulty.map((d) => DIFFICULTY_LABELS[d]),
    ...labelled('laterality', state.laterality),
    ...(state.performed === 'all' ? [] : [PERFORMED_SUMMARY[state.performed]]),
    ...(state.timedHolds ? ['Timed holds'] : []),
    ...(state.onLadder ? ['On a ladder'] : []),
  ];
  return {
    works: summarizeLabels(works),
    moves: summarizeLabels(moves),
    need: summarizeLabels(need),
    fit: summarizeLabels(fit),
  };
}
