/**
 * Search, filters, and ordering for the Exercises page. Run against the real bundled library
 * where the assertion is about content ("every filter chip yields at least one exercise"), and
 * against hand-built records where it is about the rule itself.
 */
import { exerciseLibrary } from '@roamfit/data';
import type { Exercise } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import {
  activeFilterCount,
  buildFilterOptions,
  EMPTY_FILTERS,
  filterExercises,
  formatToken,
  MULTI_SELECT_KEYS,
  primaryMuscleLabel,
  timesCompletedLabel,
} from './exerciseCatalog';

type CatalogState = exerciseCatalogRepo.ExerciseCatalogState;

const FALLBACK: CatalogState = {
  timesCompleted: 0,
  lastPerformedAt: null,
  userVideoId: null,
  curatedVideoId: null,
  hasVideo: false,
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
    anchor_class: 'none',
    unilateral: false,
    metric: 'reps',
    default_seconds: null,
    tier: 'core',
    role: 'main',
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

describe('video filter — the "which still need a link" view', () => {
  const exercises = [
    exercise({ id: 'has-user', name: 'A' }),
    exercise({ id: 'has-curated', name: 'B' }),
    exercise({ id: 'needs', name: 'C' }),
  ];
  const catalog: Record<string, CatalogState> = {
    'has-user': { ...FALLBACK, userVideoId: 'abc', hasVideo: true },
    'has-curated': { ...FALLBACK, curatedVideoId: 'def', hasVideo: true },
  };

  it('isolates the exercises with no video from either source', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, video: 'needs_video' }, catalog)).toEqual(['needs']);
  });

  it('and the ones that already have one, from either source', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, video: 'has_video' }, catalog)).toEqual([
      'has-user',
      'has-curated',
    ]);
  });

  it('an exercise with no catalogue row at all counts as needing one', () => {
    expect(all(exercises, { ...EMPTY_FILTERS, video: 'needs_video' }, {})).toEqual([
      'has-user',
      'has-curated',
      'needs',
    ]);
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
      role: 'main',
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
      role: 'main',
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
    ['anchor class', { anchorClass: ['none' as const] }, ['plank']],
    ['metric', { metric: ['time' as const] }, ['plank']],
    ['laterality', { laterality: ['unilateral' as const] }, ['pullup']],
    ['difficulty', { difficulty: ['hard' as const] }, ['pullup']],
    ['tier', { tier: ['stretch' as const] }, ['pullup']],
    ['progression family', { family: ['anti_extension' as const] }, ['plank']],
    ['contraindication', { contraindication: ['elbow' as const] }, ['pullup']],
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

  it('matches an exercise carrying any of the selected contraindications, not all of them', () => {
    expect(
      all(exercises, { ...EMPTY_FILTERS, contraindication: ['elbow', 'core_pressure'] }),
    ).toEqual(['plank', 'pullup']);
  });

  it('treats an unladdered exercise as the "none" family, which is filterable', () => {
    const accessory = [...exercises, exercise({ id: 'stretch', name: 'Chest Stretch' })];
    expect(all(accessory, { ...EMPTY_FILTERS, family: ['none'] })).toEqual(['stretch']);
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
        video: 'needs_video',
        performed: 'never',
      }),
    ).toBe(5);
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
    expect(options.role).toEqual(['warmup', 'main', 'cooldown']);
    expect(options.tier).toEqual(['core', 'fill', 'stretch']);
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

  it('says nothing punishing about an exercise never done', () => {
    expect(timesCompletedLabel(0)).toBe('Not done yet');
    expect(timesCompletedLabel(3)).toBe('3× completed');
  });
});
