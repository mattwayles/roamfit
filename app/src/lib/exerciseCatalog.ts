/**
 * The Exercises page's search, filters, and ordering — pure functions over the already-loaded
 * library and the already-read catalogue state, in the same shape as `dashboard.ts`: callers
 * fetch, this file only decides what to show and in what order. No I/O, no store calls, so the
 * whole filter surface is unit-testable without a database or a rendered screen.
 *
 * The filter vocabulary is derived from the library itself (`buildFilterOptions`) rather than
 * hard-coded from the type unions. A value nobody's content actually uses would otherwise show up
 * as a chip that always yields an empty list, and a value added to the library later would need
 * this file edited to become filterable.
 */
import type {
  Anchor,
  AnchorClass,
  Contraindication,
  Difficulty,
  Equipment,
  Exercise,
  Focus,
  Metric,
  Pattern,
  ProgressionFamilyId,
  Role,
  Tier,
} from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';

type CatalogState = exerciseCatalogRepo.ExerciseCatalogState;

/** "Needs video" is the operator view: exercises with no user-assigned and no curated id, i.e.
 *  the ones still waiting for a link. */
export type VideoFilter = 'all' | 'has_video' | 'needs_video';
export type PerformedFilter = 'all' | 'performed' | 'never';
export type LateralityFilter = 'unilateral' | 'bilateral';
/** A family chip, plus the real and useful "belongs to no ladder" case (warmups, stretches,
 *  finishers — `progression_family: null` on the record). */
export type FamilyFilter = ProgressionFamilyId | 'none';

export interface ExerciseFilterState {
  query: string;
  video: VideoFilter;
  performed: PerformedFilter;
  focus: Focus[];
  pattern: Pattern[];
  equipment: Equipment[];
  anchor: Anchor[];
  anchorClass: AnchorClass[];
  metric: Metric[];
  tier: Tier[];
  role: Role[];
  difficulty: Difficulty[];
  laterality: LateralityFilter[];
  family: FamilyFilter[];
  /** Primary muscle worked — the field the card headlines. */
  primary: string[];
  contraindication: Contraindication[];
}

export const EMPTY_FILTERS: ExerciseFilterState = {
  query: '',
  video: 'all',
  performed: 'all',
  focus: [],
  pattern: [],
  equipment: [],
  anchor: [],
  anchorClass: [],
  metric: [],
  tier: [],
  role: [],
  difficulty: [],
  laterality: [],
  family: [],
  primary: [],
  contraindication: [],
};

/** Every multi-select dimension, in the order the filter sheet lays them out. Single source for
 *  "which keys are chip groups", so adding a dimension doesn't need three files kept in step. */
export const MULTI_SELECT_KEYS = [
  'focus',
  'primary',
  'pattern',
  'equipment',
  'anchor',
  'anchorClass',
  'metric',
  'laterality',
  'difficulty',
  'tier',
  'role',
  'family',
  'contraindication',
] as const;

export type MultiSelectKey = (typeof MULTI_SELECT_KEYS)[number];

export const MULTI_SELECT_LABELS: Record<MultiSelectKey, string> = {
  focus: 'Focus',
  primary: 'Primary muscle',
  pattern: 'Movement pattern',
  equipment: 'Equipment',
  anchor: 'Anchor',
  anchorClass: 'Anchor class',
  metric: 'Metric',
  laterality: 'Sides',
  difficulty: 'Difficulty',
  tier: 'Tier',
  role: 'Role',
  family: 'Progression family',
  contraindication: 'Contraindications',
};

export type FilterOptions = Record<MultiSelectKey, string[]>;

/** How many filters are narrowing the list right now — the number on the Filters button, and the
 *  thing "Clear all" clears. The search box is deliberately not counted: it has its own visible
 *  text and its own clear affordance. */
export function activeFilterCount(state: ExerciseFilterState): number {
  const multi = MULTI_SELECT_KEYS.reduce((n, key) => n + state[key].length, 0);
  return multi + (state.video === 'all' ? 0 : 1) + (state.performed === 'all' ? 0 : 1);
}

/**
 * Search normalization: lower-cased, with everything that isn't a letter or digit dropped. That is
 * what makes "pushup" find "Push-Up" and "band row" find "Banded Row" — the punctuation in this
 * library's names and aliases (hyphens, apostrophes, slashes) is exactly what a one-handed
 * mid-search user leaves out.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesQuery(exercise: Exercise, query: string): boolean {
  const needle = normalize(query);
  if (needle === '') return true;
  if (normalize(exercise.name).includes(needle)) return true;
  return exercise.aliases.some((alias) => normalize(alias).includes(needle));
}

/** Empty selection means "no constraint on this dimension" — the chip group is off, not
 *  matching nothing. Within a group the values are OR'd; across groups they are AND'd. */
function matchesAny<T extends string>(selected: T[], values: T[]): boolean {
  return selected.length === 0 || values.some((v) => selected.includes(v));
}

export function familyOf(exercise: Exercise): FamilyFilter {
  return exercise.progression_family ?? 'none';
}

/**
 * The whole filter pipeline, ending in the alphabetical order the list is always in. Sorting is
 * not a user-facing option: an A–Z list is what makes a 219-exercise library scannable, and a
 * changing sort would defeat the muscle memory of knowing roughly where something sits.
 *
 * `catalog` is the store's per-exercise state keyed by id; an id missing from it has simply never
 * been performed and has no video, which `fallback` supplies.
 */
export function filterExercises(
  exercises: Exercise[],
  state: ExerciseFilterState,
  catalog: Record<string, CatalogState>,
  fallback: CatalogState,
): Exercise[] {
  return exercises
    .filter((exercise) => {
      const catalogState = catalog[exercise.id] ?? fallback;

      if (!matchesQuery(exercise, state.query)) return false;

      if (state.video === 'has_video' && !catalogState.hasVideo) return false;
      if (state.video === 'needs_video' && catalogState.hasVideo) return false;

      if (state.performed === 'performed' && catalogState.timesCompleted === 0) return false;
      if (state.performed === 'never' && catalogState.timesCompleted > 0) return false;

      return (
        matchesAny(state.focus, exercise.focus) &&
        matchesAny(state.primary, exercise.primary) &&
        matchesAny(state.pattern, [exercise.pattern]) &&
        matchesAny(state.equipment, [exercise.equipment]) &&
        matchesAny(state.anchor, [exercise.anchor]) &&
        matchesAny(state.anchorClass, [exercise.anchor_class]) &&
        matchesAny(state.metric, [exercise.metric]) &&
        matchesAny(state.laterality, [exercise.unilateral ? 'unilateral' : 'bilateral']) &&
        matchesAny(state.difficulty, [exercise.difficulty]) &&
        matchesAny(state.tier, [exercise.tier]) &&
        matchesAny(state.role, [exercise.role]) &&
        matchesAny(state.family, [familyOf(exercise)]) &&
        // A contraindication chip asks "which exercises carry this flag?", which is how you find
        // everything a given limitation would rule out. It never *applies* the safety filter —
        // that lives in the engine, in code, before anything is generated (invariant 3).
        matchesAny(state.contraindication, exercise.contraindications)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The values actually present in the bundled library, per dimension, each in a stable order:
 *  the fixed vocabularies (laterality, difficulty) keep their natural order, everything else is
 *  alphabetical so a long chip group is scannable. */
export function buildFilterOptions(exercises: Exercise[]): FilterOptions {
  const collect = (pick: (e: Exercise) => string[]): string[] =>
    [...new Set(exercises.flatMap(pick))].sort((a, b) => a.localeCompare(b));

  const inOrder = (order: readonly string[], present: Set<string>): string[] =>
    order.filter((v) => present.has(v));

  return {
    focus: collect((e) => e.focus),
    primary: collect((e) => e.primary),
    pattern: collect((e) => [e.pattern]),
    equipment: collect((e) => [e.equipment]),
    anchor: collect((e) => [e.anchor]),
    anchorClass: collect((e) => [e.anchor_class]),
    metric: collect((e) => [e.metric]),
    laterality: inOrder(
      ['bilateral', 'unilateral'],
      new Set(exercises.map((e) => (e.unilateral ? 'unilateral' : 'bilateral'))),
    ),
    difficulty: inOrder(['easy', 'medium', 'hard'], new Set(exercises.map((e) => e.difficulty))),
    tier: inOrder(['core', 'fill', 'stretch'], new Set(exercises.map((e) => e.tier))),
    role: inOrder(['warmup', 'main', 'cooldown'], new Set(exercises.map((e) => e.role))),
    family: collect((e) => [familyOf(e)]),
    contraindication: collect((e) => e.contraindications),
  };
}

/** `front_delts` -> `Front delts`, `anchor-mid` -> `Anchor mid`. The library's identifiers are
 *  snake/kebab-cased for the engine's benefit; nothing in them is worth showing a user raw. */
export function formatToken(token: string): string {
  const words = token.replace(/[_-]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The card's second line: the primary muscle the exercise works. A handful of records list more
 *  than one; the first is the headline and the rest are on the detail page. */
export function primaryMuscleLabel(exercise: Exercise): string {
  return exercise.primary.length > 0 ? formatToken(exercise.primary[0]) : '—';
}

export function timesCompletedLabel(timesCompleted: number): string {
  if (timesCompleted === 0) return 'Not done yet';
  return `${timesCompleted}× completed`;
}
