import { exerciseLibrary } from '@roamfit/data';
import { FIXED_POINT_ANCHORS, difficultyCapForExercise } from './hardFilters';

const row = exerciseLibrary.exercises.find((e) => e.id === 'bw-inverted-row')!;
const pullup = exerciseLibrary.exercises.find((e) => e.id === 'bw-pull-up')!;

it('every bodyweight_bearing anchor is available by default, including pull-ups', () => {
  // §5.3: the "Available Equipment" picker starts fully checked — a new user sees the whole
  // library, not a pre-narrowed one — so bodyweight_bearing exercises are no longer held back
  // pending an opt-in. Safety instead lives entirely in the §13.1 difficulty cap below, which
  // does not depend on this list at all.
  expect(FIXED_POINT_ANCHORS).toContain(row.anchor);
  expect(FIXED_POINT_ANCHORS).toContain(pullup.anchor);
  const bearing = exerciseLibrary.exercises.filter((e) => e.anchor_class === 'bodyweight_bearing');
  for (const e of bearing) {
    expect(FIXED_POINT_ANCHORS).toContain(e.anchor);
  }
});

it('the §13.1 difficulty cap still applies to the inverted row', () => {
  expect(row.anchor_class).toBe('bodyweight_bearing');
  expect(difficultyCapForExercise(row, 'hard')).toBe('medium');
  expect(difficultyCapForExercise(row, 'medium')).toBe('medium');
  expect(difficultyCapForExercise(row, 'easy')).toBe('easy');
});

it('the §13.1 difficulty cap applies to the low-bar hang too', () => {
  const hang = exerciseLibrary.exercises.find((e) => e.id === 'bw-low-bar-hang')!;
  expect(hang.anchor_class).toBe('bodyweight_bearing');
  expect(difficultyCapForExercise(hang, 'hard')).toBe('medium');
});

it('the §13.1 difficulty cap applies to a real pull-up too', () => {
  expect(pullup.anchor_class).toBe('bodyweight_bearing');
  expect(difficultyCapForExercise(pullup, 'hard')).toBe('medium');
});
