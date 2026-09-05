/**
 * Admin "reset progression ladders" setting — resets session counters to 0 on every ladder
 * without moving `level_id` (invariant 5).
 */
import { defaultMicroForExercise } from '@roamfit/engine';
import { createTestDb } from '../testHarness';
import { library, families, utcInstantFor } from '../testFixtures';
import {
  ensureProgressionStatesInitialized,
  getAllProgressionStates,
  resetAllProgressionSessions,
  upsertProgressionState,
} from './progressionState';

describe('resetAllProgressionSessions', () => {
  it('zeroes consecutiveHits/consecutiveMisses on every family, leaving level_id untouched', () => {
    const { db, close } = createTestDb();
    try {
      ensureProgressionStatesInitialized(
        db,
        families,
        library.exercises,
        utcInstantFor('2026-08-01'),
      );
      const before = getAllProgressionStates(db);

      // Simulate progress on a couple of families past a fresh seed.
      const horizontalPush = before.horizontal_push;
      upsertProgressionState(
        db,
        {
          ...horizontalPush,
          levelId: 'horizontal_push.l2',
          consecutiveHits: 4,
          consecutiveMisses: 1,
        },
        utcInstantFor('2026-08-05'),
      );
      const squat = before.squat;
      upsertProgressionState(
        db,
        { ...squat, consecutiveHits: 2, consecutiveMisses: 0 },
        utcInstantFor('2026-08-05'),
      );

      resetAllProgressionSessions(db, families, library.exercises, utcInstantFor('2026-08-06'));

      const after = getAllProgressionStates(db);
      for (const familyId of Object.keys(before) as Array<keyof typeof before>) {
        expect(after[familyId].consecutiveHits).toBe(0);
        expect(after[familyId].consecutiveMisses).toBe(0);
        // The rung itself must never move — that's the whole point of this reset.
        expect(after[familyId].levelId).toBe(
          familyId === 'horizontal_push' ? 'horizontal_push.l2' : before[familyId].levelId,
        );
      }
    } finally {
      close();
    }
  });

  it('re-seeds micro for the current level, not the level the ladder started at', () => {
    const { db, close } = createTestDb();
    try {
      ensureProgressionStatesInitialized(
        db,
        families,
        library.exercises,
        utcInstantFor('2026-08-01'),
      );
      const seeded = getAllProgressionStates(db).horizontal_push;

      // Advance two rungs and consume some progress within the new level's micro-steps.
      upsertProgressionState(
        db,
        {
          ...seeded,
          levelId: 'horizontal_push.l2',
          micro: { ...seeded.micro, repTarget: seeded.micro.repTarget + 10 },
          consecutiveHits: 3,
          consecutiveMisses: 2,
        },
        utcInstantFor('2026-08-05'),
      );

      resetAllProgressionSessions(db, families, library.exercises, utcInstantFor('2026-08-06'));

      const anchor = library.exercises.find((e) => e.id === 'bw-incline-push-up')!;
      const expectedMicro = defaultMicroForExercise(anchor);
      const after = getAllProgressionStates(db).horizontal_push;
      expect(after.levelId).toBe('horizontal_push.l2');
      expect(after.micro).toEqual(expectedMicro);
    } finally {
      close();
    }
  });

  it('is a no-op on families with no progression row yet', () => {
    const { db, close } = createTestDb();
    try {
      resetAllProgressionSessions(db, families, library.exercises, utcInstantFor('2026-08-06'));
      expect(getAllProgressionStates(db)).toEqual({});
    } finally {
      close();
    }
  });
});
