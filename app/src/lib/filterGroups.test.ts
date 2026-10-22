import { exerciseLibrary } from '@roamfit/data';
import { EMPTY_FILTERS, buildFilterOptions, filterExercises } from './exerciseCatalog';
import type { ExerciseFilterState } from './exerciseCatalog';
import { filterValueLabel } from './filterLabels';
import {
  MUSCLE_GROUPS,
  PATTERN_FAMILIES,
  availableMembers,
  groupSelection,
  sectionSummaries,
  selectionChips,
  summarizeLabels,
  toggleGroup,
} from './filterGroups';

const options = buildFilterOptions(exerciseLibrary.exercises);
const fallback = { timesCompleted: 0, disabled: false } as never;

describe('muscle groups and pattern families', () => {
  it.each([
    ['muscle', MUSCLE_GROUPS, options.primary],
    ['pattern', PATTERN_FAMILIES, options.pattern],
  ])('every library %s lands in exactly one group, and no group invents one', (_n, groups, all) => {
    for (const value of all) {
      expect(groups.filter((g) => g.members.includes(value))).toHaveLength(1);
    }
    for (const group of groups) {
      expect(group.members.length).toBeGreaterThan(0);
      for (const m of group.members) expect(all).toContain(m);
    }
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it('keeps the counts the design asked for', () => {
    expect(MUSCLE_GROUPS).toHaveLength(8);
    expect(PATTERN_FAMILIES).toHaveLength(8);
  });
});

describe('group selection', () => {
  const legs = MUSCLE_GROUPS.find((g) => g.id === 'legs')!;
  const avail = options.primary;

  it('reports none / partial / all', () => {
    expect(groupSelection(legs, [], avail)).toBe('none');
    expect(groupSelection(legs, ['quads'], avail)).toBe('partial');
    expect(groupSelection(legs, availableMembers(legs, avail), avail)).toBe('all');
  });

  it('a group tap fills a partial group, then clears a full one, leaving others alone', () => {
    const filled = toggleGroup(legs, ['quads', 'glutes'], avail);
    expect(groupSelection(legs, filled, avail)).toBe('all');
    expect(filled).toContain('glutes');
    const cleared = toggleGroup(legs, filled, avail);
    expect(cleared).toEqual(['glutes']);
  });

  it('only counts members the library has', () => {
    expect(groupSelection(legs, ['quads'], ['quads'])).toBe('all');
    expect(toggleGroup(legs, [], ['quads'])).toEqual(['quads']);
  });
});

describe('selection chips and summaries', () => {
  const label = (v: string) => filterValueLabel('primary', v);
  it('shows a whole group as its name and a partial one member by member', () => {
    const shoulders = MUSCLE_GROUPS.find((g) => g.id === 'shoulders')!;
    const chips = selectionChips(
      MUSCLE_GROUPS,
      [...shoulders.members, 'glutes', 'quads'],
      options.primary,
      label,
    );
    expect(chips.map((c) => c.label)).toEqual(['Shoulders', 'Glutes', 'Quads']);
    expect(chips[0].values).toEqual([...shoulders.members]);
  });

  it('summarises with Any, a dot list, and a +N tail', () => {
    expect(summarizeLabels([])).toBe('Any');
    expect(summarizeLabels(['Legs', 'Glutes'])).toBe('Legs · Glutes');
    expect(summarizeLabels(['A', 'B', 'C', 'D'])).toBe('A · B · +2');
  });

  it('summarises each section from the filter state', () => {
    expect(sectionSummaries(EMPTY_FILTERS, options)).toEqual({
      works: 'Any',
      moves: 'Any',
      need: 'Any',
      fit: 'Any',
    });
    const state: ExerciseFilterState = {
      ...EMPTY_FILTERS,
      focus: ['legs'],
      primary: ['glutes'],
      pattern: ['squat'],
      noGear: true,
      performed: 'never',
      timedHolds: true,
    };
    expect(sectionSummaries(state, options)).toEqual({
      works: 'Legs · Glutes',
      moves: 'Squat',
      need: 'No gear',
      fit: 'Not yet · Timed holds',
    });
  });
});

describe('filtering is unchanged by grouping', () => {
  it('a group selection returns exactly what tapping each member does', () => {
    const arms = MUSCLE_GROUPS.find((g) => g.id === 'arms')!;
    const viaGroup = toggleGroup(arms, [], options.primary);
    const viaMembers = [...arms.members].filter((m) => options.primary.includes(m));
    const run = (primary: string[]) =>
      filterExercises(exerciseLibrary.exercises, { ...EMPTY_FILTERS, primary }, {}, fallback).map(
        (e) => e.id,
      );
    expect(run(viaGroup)).toEqual(run(viaMembers));
    expect(run(viaGroup).length).toBeGreaterThan(0);
    const direct = exerciseLibrary.exercises.filter((e) =>
      e.primary.some((p) => arms.members.includes(p)),
    );
    expect(run(viaGroup)).toHaveLength(direct.length);
  });

  it('a family selection matches its member patterns', () => {
    const push = PATTERN_FAMILIES.find((g) => g.id === 'push')!;
    const pattern = toggleGroup(push, [], options.pattern) as ExerciseFilterState['pattern'];
    const got = filterExercises(exerciseLibrary.exercises, { ...EMPTY_FILTERS, pattern }, {}, fallback);
    expect(got).toHaveLength(
      exerciseLibrary.exercises.filter((e) => push.members.includes(e.pattern)).length,
    );
  });
});
