/**
 * Track 41 — manual ladder moves are never refused for equipment. A brand-new user has no anchors
 * and no bands, and can still walk every ladder to the top and back down to level 1.
 */
import { createTestDb } from './testHarness';
import { levelDownFamily, levelUpFamily } from './levelUp';
import {
  ensureProgressionStatesInitialized,
  getAllProgressionStates,
} from './repositories/progressionState';
import { ensureUser } from './repositories/users';
import { clockFor, families, library, rngFor, utcInstantFor } from './testFixtures';

describe('levelUpFamily / levelDownFamily (Track 41: no equipment gate)', () => {
  it('a user with no equipment moves every ladder to its top rung and back to its first', () => {
    const { db, close } = createTestDb();
    try {
      const now = utcInstantFor('2026-10-18');
      const user = ensureUser(db, now);
      expect(user.anchorsAvailable).toEqual([]);
      expect(user.bandSettings.owned).toEqual([]);
      ensureProgressionStatesInitialized(db, families, library.exercises, now);
      const input = (familyId: string, seed: number) => ({
        familyId: familyId as never,
        library,
        families,
        clock: clockFor('2026-10-18'),
        rng: rngFor(seed),
      });

      for (const family of families.families) {
        const levelIds = family.levels.map((l) => l.level_id);
        for (let i = 1; i < levelIds.length; i++) {
          const up = levelUpFamily(db, input(family.id, i), now);
          expect(up).toMatchObject({ status: 'levelled_up', levelId: levelIds[i] });
          // The named exercise is on the rung just reached.
          if (up.status === 'levelled_up') {
            expect(family.levels[i].exercise_ids).toContain(up.exerciseId);
          }
        }
        expect(levelUpFamily(db, input(family.id, 0), now).status).toBe('at_max');

        for (let i = levelIds.length - 2; i >= 0; i--) {
          expect(levelDownFamily(db, input(family.id, i), now)).toMatchObject({
            status: 'levelled_down',
            levelId: levelIds[i],
          });
        }
        expect(levelDownFamily(db, input(family.id, 0), now).status).toBe('at_min');
        expect(getAllProgressionStates(db)[family.id as never]).toMatchObject({
          levelId: levelIds[0],
        });
      }
    } finally {
      close();
    }
  });
});
