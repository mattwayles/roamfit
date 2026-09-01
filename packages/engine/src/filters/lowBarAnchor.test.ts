import { exerciseLibrary } from '@roamfit/data';
import { DEFAULT_ANCHORS_AVAILABLE, effortCapForExercise } from './hardFilters';

const row = exerciseLibrary.exercises.find((e) => e.id === 'bw-inverted-row')!;
const pullup = exerciseLibrary.exercises.find((e) => e.id === 'bw-pull-up')!;

it('inverted row is available by default; real pull-ups still are not', () => {
  expect(DEFAULT_ANCHORS_AVAILABLE).toContain(row.anchor);
  expect(DEFAULT_ANCHORS_AVAILABLE).not.toContain(pullup.anchor);
});

it('the §13.1 effort cap still applies to the inverted row', () => {
  expect(row.anchor_class).toBe('bodyweight_bearing');
  expect(effortCapForExercise(row, 'hard')).toBe('normal');
  expect(effortCapForExercise(row, 'normal')).toBe('normal');
  expect(effortCapForExercise(row, 'easy')).toBe('easy');
});

it('no other exercise became default-available as a side effect', () => {
  const bearing = exerciseLibrary.exercises.filter((e) => e.anchor_class === 'bodyweight_bearing');
  const defaultAvailable = bearing.filter((e) => DEFAULT_ANCHORS_AVAILABLE.includes(e.anchor));
  expect(defaultAvailable.map((e) => e.id)).toEqual(['bw-inverted-row']);
});
