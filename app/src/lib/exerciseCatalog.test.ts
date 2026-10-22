/**
 * Search, filters, and ordering for the Exercises page. Run against the real bundled library
 * where the assertion is about content ("every filter chip yields at least one exercise"), and
 * against hand-built records where it is about the rule itself.
 */
import { exerciseLibrary } from '@roamfit/data';
import { applyHardFilters, type Limitation } from '@roamfit/engine';
import type { Exercise } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import {
  activeFilterCount,
  buildFilterOptions,
  EMPTY_FILTERS,
  filterExercises,
  formatToken,
  MULTI_SELECT_KEYS,
  needsNoGear,
  withBand,
  withNoGear,
  primaryMuscleLabel,
  TOGGLE_KEYS,
  TOGGLE_LABELS,
  timesCompletedLabel,
} from './exerciseCatalog';
import { filterValueLabel } from './filterLabels';

type CatalogState = exerciseCatalogRepo.ExerciseCatalogState;

const FALLBACK: CatalogState = {
  timesCompleted: 0,
  lastPerformedAt: null,
  disabled: false,
};

function exercise(overrides: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    aliases: [],
    focus: ['upper'],
    pattern: 'horizontal_push',
    primary: ['chest'],
    secondary: [],
    equipment: 'band',
    band: 'B1-B2',
    anchor: 'none',
    anchor_alt: null,
    anchor_class: 'none',
    unilateral: false,
    metric: 'reps',
    default_seconds: null,
    tier: 'core',
    roles: ['main'],
    difficulty: 'medium',
    progression_family: null,
    progression_level_id: null,
    contraindications: [],
    setup: 'Set up.',
    video_search: 'https://example.com',
    ...overrides,
  };
}

const all = (
  exercises: Exercise[],
  state = EMPTY_FILTERS,
  catalog: Record<string, CatalogState> = {},
) => filterExercises(exercises, state, catalog, FALLBACK).map((e) => e.id);

describe('ordering', () => {
  it('is always alphabetical by name, whatever order the library is in', () => {
    const exercises = [
      exercise({ id: 'c', name: 'Zercher Squat' }),
      exercise({ id: 'a', name: 'Archer Push-Up' }),
      exercise({ id: 'b', name: 'Monster Walk' }),
    ];
    expect(all(exercises)).toEqual(['a', 'b', 'c']);
  });

  it('holds after filtering too', () => {
    const exercises = [
      exercise({ id: 'z', name: 'Zercher Squat', difficulty: 'hard' }),
      exercise({ id: 'a', name: 'Archer Push-Up', difficulty: 'hard' }),
      exercise({ id: 'm', name: 'Monster Walk', difficulty: 'easy' }),
    ];
    expect(all(exercises, { ...EMPTY_FILTERS, difficulty: ['hard'] })).toEqual(['a', 'z']);
  });
});

describe('search', () => {
  const exercises = [
    exercise({ id: 'push', name: 'Banded Push-Up', aliases: ['Push-Up', 'banded push up'] }),
    exercise({ id: 'row', name: 'Banded Row' }),
    exercise({ id: 'squat', name: 'Goblet Squat' }),
  ];

  it('matches on name, case- and punctuation-insensitively', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, query: 'pushup' })).toEqual(['push']);
    expect(all(exercises, { ...EMPTY_FILTERS, query: 'PUSH-up' })).toEqual(['push']);
  });

  it('matches partway through a name, so a search is useful before it is finished', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, query: 'band' })).toEqual(['push', 'row']);
  });

  it('matches aliases — the name someone actually calls it', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, query: 'goblet' })).toEqual(['squat']);
    const aliasOnly = [exercise({ id: 'x', name: 'Hip Hinge Airplane', aliases: ['Warrior 3'] })];
    expect(all(aliasOnly, { ...EMPTY_FILTERS, query: 'warrior' })).toEqual(['x']);
  });

  it('an empty query constrains nothing', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, query: '   ' })).toHaveLength(3);
  });

  it('a query that matches nothing returns nothing, rather than everything', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, query: 'deadlift' })).toEqual([]);
  });
});

describe('performed filter', () => {
  const exercises = [exercise({ id: 'done', name: 'A' }), exercise({ id: 'new', name: 'B' })];
  const catalog: Record<string, CatalogState> = {
    done: { ...FALLBACK, timesCompleted: 4, lastPerformedAt: '2026-08-01' },
  };

  it('splits what you have done from what you have not', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, performed: 'performed' }, catalog)).toEqual(['done']);
    expect(all(exercises, { ...EMPTY_FILTERS, performed: 'never' }, catalog)).toEqual(['new']);
  });
});

describe('library dimensions', () => {
  const exercises = [
    exercise({
      id: 'plank',
      name: 'Plank',
      focus: ['abs'],
      pattern: 'anti_extension',
      primary: ['abs'],
      equipment: 'bodyweight',
      anchor: 'none',
      anchor_class: 'none',
      metric: 'time',
      default_seconds: 45,
      unilateral: false,
      tier: 'core',
      roles: ['main'],
      difficulty: 'easy',
      progression_family: 'anti_extension',
      progression_level_id: 'anti_extension.l1',
      contraindications: ['core_pressure'],
    }),
    exercise({
      id: 'pullup',
      name: 'Pull-Up',
      focus: ['upper'],
      pattern: 'vertical_pull',
      primary: ['lats'],
      equipment: 'bodyweight',
      anchor: 'pullup-bar',
      anchor_class: 'bodyweight_bearing',
      metric: 'reps',
      unilateral: true,
      tier: 'stretch',
      roles: ['main'],
      difficulty: 'hard',
      progression_family: 'vertical_pull',
      progression_level_id: 'vertical_pull.l7',
      contraindications: ['shoulder_overhead', 'elbow'],
    }),
  ];

  it.each([
    ['focus', { focus: ['abs' as const] }, ['plank']],
    ['pattern', { pattern: ['vertical_pull' as const] }, ['pullup']],
    ['primary muscle', { primary: ['lats'] }, ['pullup']],
    ['anchor', { anchor: ['pullup-bar' as const] }, ['pullup']],
    ['timed holds', { timedHolds: true }, ['plank']],
    ['on a ladder', { onLadder: true }, ['plank', 'pullup']],
    ['no gear', { noGear: true }, ['plank']],
    ['laterality', { laterality: ['unilateral' as const] }, ['pullup']],
    ['difficulty', { difficulty: ['hard' as const] }, ['pullup']],
  ])('filters by %s', (_label, patch, expected) => {
    expect(all(exercises, { ...EMPTY_FILTERS, ...patch })).toEqual(expected);
  });

  it('ORs within a dimension', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, difficulty: ['easy', 'hard'] })).toEqual([
      'plank',
      'pullup',
    ]);
  });

  it('ANDs across dimensions', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, difficulty: ['hard'], focus: ['abs'] })).toEqual([]);
  });

  it('"On a ladder" leaves out unladdered moves (warmups, stretches, finishers)', () => {
    const accessory = [...exercises, exercise({ id: 'stretch', name: 'Chest Stretch' })];
    expect(all(accessory, { ...EMPTY_FILTERS, onLadder: true })).toEqual(['plank', 'pullup']);
  });

  it('"No gear" is bodyweight with no anchor — not a bar, bench or rope, and not a band', () => {
    const gear = [
      exercise({ id: 'squat', name: 'Squat', equipment: 'bodyweight', band: null }),
      exercise({
        id: 'bench',
        name: 'Step-Up',
        equipment: 'bodyweight',
        band: null,
        anchor: 'body-support',
      }),
      exercise({
        id: 'rope',
        name: 'Jump Rope',
        equipment: 'bodyweight',
        band: null,
        anchor: 'jump-rope',
      }),
      exercise({ id: 'row', name: 'Band Row', anchor: 'stance' }),
    ];
    expect(gear.filter(needsNoGear).map((e) => e.id)).toEqual(['squat']);
    expect(all(gear, { ...EMPTY_FILTERS, noGear: true })).toEqual(['squat']);
  });
});

describe('activeFilterCount', () => {
  it('is zero with nothing applied, and ignores the search box', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: 'push' })).toBe(0);
  });

  it('counts each selected value and each non-default single-select', () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        difficulty: ['easy', 'hard'],
        focus: ['abs'],
        performed: 'never',
      }),
    ).toBe(4);
  });

  it('counts each switch that is on', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, noGear: true, timedHolds: true })).toBe(2);
  });
});

describe('buildFilterOptions, against the real library', () => {
  const options = buildFilterOptions(exerciseLibrary.exercises);

  it('offers options for every dimension', () => {
    for (const key of MULTI_SELECT_KEYS) {
      expect(options[key].length).toBeGreaterThan(0);
    }
  });

  it('keeps the ordered vocabularies in their natural order, not alphabetical', () => {
    expect(options.difficulty).toEqual(['easy', 'medium', 'hard']);
  });

  it('offers no chip that matches nothing — every option yields at least one exercise', () => {
    for (const key of MULTI_SELECT_KEYS) {
      for (const value of options[key]) {
        const state = { ...EMPTY_FILTERS, [key]: [value] } as typeof EMPTY_FILTERS;
        expect(
          filterExercises(exerciseLibrary.exercises, state, {}, FALLBACK).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('lists no duplicates', () => {
    for (const key of MULTI_SELECT_KEYS) {
      expect(new Set(options[key]).size).toBe(options[key].length);
    }
  });
});

describe('filter labels, against the real library', () => {
  const options = buildFilterOptions(exerciseLibrary.exercises);
  const labelled = MULTI_SELECT_KEYS;

  it('has a hand-written label for every value, none falling back to the raw id', () => {
    for (const key of labelled) {
      for (const value of options[key]) {
        const label = filterValueLabel(key, value);
        expect(label).not.toBe(value);
        expect(label).not.toMatch(/[_]|anchor-/);
        expect(label).toBe(label.trim());
      }
    }
  });

  it('gives different values different labels within a dimension', () => {
    for (const key of labelled) {
      const names = options[key].map((v) => filterValueLabel(key, v));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('reuses the existing anchor wording', () => {
    expect(filterValueLabel('anchor', 'anchor-mid')).toBe(
      'Mid band anchor point, waist to chest height',
    );
    expect(filterValueLabel('anchor', 'body-support')).toBe('Bench or step');
  });

  it('has a label for every switch', () => {
    for (const key of TOGGLE_KEYS) expect(TOGGLE_LABELS[key]).toBeTruthy();
  });
});

describe('card copy', () => {
  it('prettifies the library identifiers', () => {
    expect(formatToken('front_delts')).toBe('Front delts');
    expect(formatToken('anchor-mid')).toBe('Anchor mid');
  });

  it('headlines the first primary muscle', () => {
    expect(primaryMuscleLabel(exercise({ id: 'x', name: 'X', primary: ['glutes', 'abs'] }))).toBe(
      'Glutes',
    );
  });

  it('uses the human muscle name on the second line', () => {
    expect(primaryMuscleLabel(exercise({ id: 'x', name: 'X', primary: ['front_delts'] }))).toBe(
      'Front shoulders',
    );
    expect(primaryMuscleLabel(exercise({ id: 'x', name: 'X', primary: ['abductors'] }))).toBe(
      'Outer hips',
    );
  });

  it('says nothing punishing about an exercise never done', () => {
    expect(timesCompletedLabel(0)).toBe('Not done yet');
    expect(timesCompletedLabel(3)).toBe('3× completed');
  });
});

describe('the gear choice', () => {
  it('No gear and Band are mutually exclusive', () => {
    const band = withBand(EMPTY_FILTERS, true);
    expect(band.equipment).toEqual(['band']);
    const none = withNoGear(band, true);
    expect(none.noGear).toBe(true);
    expect(none.equipment).toEqual([]);
    expect(withBand(none, true).noGear).toBe(false);
    expect(withNoGear(none, false)).toEqual(EMPTY_FILTERS);
    expect(withBand(band, false)).toEqual(EMPTY_FILTERS);
  });
});

describe('suits my limitations', () => {
  const TODAY = '2026-10-21';
  const lim = (tag: Limitation['tag'], extra: Partial<Limitation> = {}): Limitation => ({
    tag,
    createdAt: '2026-10-01',
    source: 'user',
    ...extra,
  });
  const injury = (limitations: Limitation[]) => ({ limitations, today: TODAY });
  const on = { ...EMPTY_FILTERS, suitsLimitations: true };
  const run = (state: typeof on, limitations: Limitation[], list = exerciseLibrary.exercises) =>
    filterExercises(list, state, {}, FALLBACK, injury(limitations)).map((e) => e.id);
  const generator = (limitations: Limitation[]) =>
    applyHardFilters({
      library: exerciseLibrary.exercises,
      request: {},
      anchorsAvailable: [
        'anchor-low',
        'anchor-mid',
        'anchor-high',
        'low-bar',
        'pullup-bar',
        'body-support',
      ],
      limitations,
      disabledExerciseIds: new Set(),
      today: TODAY,
    }).map((e) => e.id);

  it('hides exactly what the generator drops for a shoulder limitation, overhead presses included', () => {
    const limitations = [lim('shoulder_overhead')];
    const shown = new Set(run(on, limitations));
    const hidden = exerciseLibrary.exercises.filter((e) => !shown.has(e.id));
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((e) => e.contraindications.includes('shoulder_overhead'))).toBe(true);
    expect(hidden.some((e) => e.pattern === 'vertical_push')).toBe(true);
    // Everything the generator keeps (before gear gating) is shown, and nothing it drops is.
    const kept = new Set(generator(limitations));
    for (const id of kept) expect(shown.has(id)).toBe(true);
    for (const e of hidden) expect(kept.has(e.id)).toBe(false);
  });

  it('is off by default: nothing is hidden', () => {
    expect(run(EMPTY_FILTERS as typeof on, [lim('shoulder_overhead')])).toHaveLength(
      exerciseLibrary.exercises.length,
    );
  });

  it('ignores expired limitations, using the same local_date rule as generation', () => {
    const expired = lim('shoulder_overhead', { source: 'pain_report', expiresAt: '2026-10-20' });
    expect(run(on, [expired])).toHaveLength(exerciseLibrary.exercises.length);
    const today = lim('shoulder_overhead', { source: 'pain_report', expiresAt: TODAY });
    expect(run(on, [today]).length).toBeLessThan(exerciseLibrary.exercises.length);
  });

  it('hides nothing with no limitations, and counts as one filter when on', () => {
    expect(run(on, [])).toHaveLength(exerciseLibrary.exercises.length);
    expect(activeFilterCount(on)).toBe(1);
  });

  it('is a labelled switch', () => {
    expect(TOGGLE_LABELS.suitsLimitations).toBe('Suits my limitations');
  });
});
