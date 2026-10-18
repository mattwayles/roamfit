import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { placeOnLadders } from '@roamfit/engine';
import { createTestDb } from '../testHarness';
import { generate } from '../generation';
import {
  applyPlacement,
  getAllProgressionStates,
  upsertProgressionState,
} from './progressionState';
import { clockFor, rngFor, utcInstantFor } from '../testFixtures';

describe('applyPlacement (track 37g)', () => {
  it('moves each ladder to its placed rung, fresh, without dating a level change', () => {
    const { db, close } = createTestDb();
    try {
      const levels = placeOnLadders(familyLibrary.families, {
        experience: 'regular',
        answers: { push_ups: 'some' },
      });
      applyPlacement(
        db,
        familyLibrary,
        exerciseLibrary.exercises,
        levels,
        utcInstantFor('2026-10-18'),
      );
      const states = getAllProgressionStates(db);
      expect(states.horizontal_push.levelId).toBe('horizontal_push.l4');
      for (const [familyId, levelId] of Object.entries(levels)) {
        const s = states[familyId as keyof typeof states];
        expect(s.levelId).toBe(levelId);
        expect(s.consecutiveHits).toBe(0);
        expect(s.lastLevelChangeAt).toBeNull();
      }
      const { plan } = generate(db, {
        library: exerciseLibrary,
        families: familyLibrary,
        request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
        clock: clockFor('2026-10-18'),
        rng: rngFor(1),
        utcInstant: utcInstantFor('2026-10-18'),
      });
      expect(plan.explanation).not.toMatch(/level up|levelled up|leveled up/i);
    } finally {
      close();
    }
  });

  it('ignores unknown families and levels', () => {
    const { db, close } = createTestDb();
    try {
      applyPlacement(db, familyLibrary, exerciseLibrary.exercises, {}, utcInstantFor('2026-10-18'));
      const before = getAllProgressionStates(db);
      upsertProgressionState(db, before.squat, utcInstantFor('2026-10-18'));
      applyPlacement(
        db,
        familyLibrary,
        exerciseLibrary.exercises,
        { squat: 'squat.l99', nope: 'nope.l1' },
        utcInstantFor('2026-10-18'),
      );
      expect(getAllProgressionStates(db).squat.levelId).toBe(before.squat.levelId);
    } finally {
      close();
    }
  });
});
