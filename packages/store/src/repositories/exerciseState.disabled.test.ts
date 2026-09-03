/**
 * Explicit, permanent per-exercise disable/enable — the persistence half of the toggle exposed
 * on the Exercises detail screen and the workout approval screen. Deliberately separate from
 * `setSuppressedUntil` (temporary, system-managed §5.2/§13.2 cooldown): this one never expires
 * on its own.
 */
import { createTestDb } from '../testHarness';
import { getDisabledExerciseIds, getExerciseState, setDisabled } from './exerciseState';

const NOW = '2026-09-02T10:00:00.000Z';
const EXERCISE_ID = 'band-row-anchor-mid';
const OTHER_EXERCISE_ID = 'banded-push-up';

describe('explicit exercise disable/enable', () => {
  it('an exercise with no disable action reads back eligible, without creating a row', () => {
    const { db } = createTestDb();
    expect(getDisabledExerciseIds(db)).toEqual([]);
    expect(getExerciseState(db, EXERCISE_ID)).toBeNull();
  });

  it('disabling adds the id to the disabled set and stamps disabledAt', () => {
    const { db } = createTestDb();
    setDisabled(db, EXERCISE_ID, true, NOW);
    expect(getDisabledExerciseIds(db)).toEqual([EXERCISE_ID]);
    expect(getExerciseState(db, EXERCISE_ID)?.disabledAt).toBe(NOW);
  });

  it('re-enabling clears disabledAt and removes it from the disabled set', () => {
    const { db } = createTestDb();
    setDisabled(db, EXERCISE_ID, true, NOW);
    setDisabled(db, EXERCISE_ID, false, '2026-09-02T11:00:00.000Z');
    expect(getDisabledExerciseIds(db)).toEqual([]);
    expect(getExerciseState(db, EXERCISE_ID)?.disabledAt).toBeNull();
  });

  it('is scoped to one exercise — disabling does not leak onto another', () => {
    const { db } = createTestDb();
    setDisabled(db, EXERCISE_ID, true, NOW);
    expect(getDisabledExerciseIds(db)).not.toContain(OTHER_EXERCISE_ID);
    expect(getExerciseState(db, OTHER_EXERCISE_ID)).toBeNull();
  });

  it('does not disturb other per-exercise state on the same row', () => {
    const { db } = createTestDb();
    setDisabled(db, EXERCISE_ID, true, NOW);
    const state = getExerciseState(db, EXERCISE_ID);
    expect(state?.suppressedUntil).toBeNull();
  });
});
