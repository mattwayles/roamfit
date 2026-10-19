import { exerciseLibrary, familyLibrary } from './index';

/**
 * Someone who owns no bands must still be able to climb every ladder. A rung whose exercises all
 * need a band is a rung that person can never train, so their progression stalls there (the
 * resolver walks down to a lower rung instead). Every rung therefore needs at least one
 * bodyweight exercise.
 */
describe('ladders without bands', () => {
  const byId = new Map(exerciseLibrary.exercises.map((e) => [e.id, e]));

  it('every rung of every ladder has a bodyweight exercise', () => {
    const bandOnly: string[] = [];
    for (const family of familyLibrary.families) {
      for (const level of family.levels) {
        const hasBodyweight = level.exercise_ids.some(
          (id) => byId.get(id)?.equipment === 'bodyweight',
        );
        if (!hasBodyweight) bandOnly.push(level.level_id);
      }
    }
    expect(bandOnly).toEqual([]);
  });

  it('a bodyweight rung exercise is not itself a warm-up or stretch only', () => {
    for (const family of familyLibrary.families) {
      for (const level of family.levels) {
        const usable = level.exercise_ids
          .map((id) => byId.get(id))
          .filter((e) => e?.equipment === 'bodyweight' && e.roles.includes('main'));
        expect({ level: level.level_id, ok: usable.length > 0 }).toEqual({
          level: level.level_id,
          ok: true,
        });
      }
    }
  });
});
