/**
 * ADR 0012 — "too easy, move me up", end to end through the store.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import { createPendingSession, getPendingSession } from './repositories/sessions';
import { getSignalEventsByType } from './repositories/signals';
import { getAllProgressionStates } from './repositories/progressionState';
import { getExerciseState } from './repositories/exerciseState';
import { levelUpEntry } from './levelUp';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';
import type { ProgressionFamilyId } from '@roamfit/data';

const DATE = '2026-04-01';

function seedSession() {
  const { db, close } = createTestDb();
  const clock = clockFor(DATE);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(DATE),
  });
  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(DATE),
    localDate: DATE,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  return { db, close, sessionId, clock };
}

function ladderedEntry(db: ReturnType<typeof createTestDb>['db']) {
  return getPendingSession(db)!.entries.find((e) => e.progressionFamilyId)!;
}

describe('levelUpEntry', () => {
  it('every family starts at level 1, so the first laddered entry is a bottom rung', () => {
    const { db, close } = seedSession();
    try {
      const states = getAllProgressionStates(db);
      for (const family of families.families) {
        expect(states[family.id].levelId).toBe(family.levels[0].level_id);
      }
    } finally {
      close();
    }
  });

  it('advances the family one rung and rewrites the entry to the new exercise', () => {
    const { db, close, clock } = seedSession();
    try {
      const entry = ladderedEntry(db);
      const familyId = entry.progressionFamilyId as ProgressionFamilyId;
      const family = families.families.find((f) => f.id === familyId)!;

      const result = levelUpEntry(
        db,
        { entryId: entry.id, library, families, clock, rng: rngFor(2) },
        utcInstantFor(DATE, 9),
      );

      expect(result.status).toBe('levelled_up');
      expect(getAllProgressionStates(db)[familyId].levelId).toBe(family.levels[1].level_id);
      const after = getPendingSession(db)!.entries.find((e) => e.id === entry.id)!;
      expect(after.exerciseId).not.toBe(entry.exerciseId);
      expect(after.progressionLevelIdAtTime).toBe(family.levels[1].level_id);
      expect(family.levels[1].exercise_ids).toContain(after.exerciseId);
    } finally {
      close();
    }
  });

  it('is repeatable — five taps climb five rungs and the entry follows', () => {
    const { db, close, clock } = seedSession();
    try {
      const entry = ladderedEntry(db);
      const familyId = entry.progressionFamilyId as ProgressionFamilyId;
      const family = families.families.find((f) => f.id === familyId)!;
      for (let i = 0; i < 5; i++) {
        const r = levelUpEntry(
          db,
          { entryId: entry.id, library, families, clock, rng: rngFor(i + 1) },
          utcInstantFor(DATE, 9),
        );
        expect(r.status).toBe('levelled_up');
      }
      expect(getAllProgressionStates(db)[familyId].levelId).toBe(family.levels[5].level_id);
      const after = getPendingSession(db)!.entries.find((e) => e.id === entry.id)!;
      expect(family.levels[5].exercise_ids).toContain(after.exerciseId);
    } finally {
      close();
    }
  });

  it('does NOT penalise the outgrown exercise — this is not a swap-away', () => {
    const { db, close, clock } = seedSession();
    try {
      const entry = ladderedEntry(db);
      levelUpEntry(
        db,
        { entryId: entry.id, library, families, clock, rng: rngFor(2) },
        utcInstantFor(DATE, 9),
      );
      expect(getExerciseState(db, entry.exerciseId)?.swapAwayCount ?? 0).toBe(0);
    } finally {
      close();
    }
  });

  it('logs a level_up_too_easy signal naming both rungs', () => {
    const { db, close, clock } = seedSession();
    try {
      const entry = ladderedEntry(db);
      const familyId = entry.progressionFamilyId as ProgressionFamilyId;
      const family = families.families.find((f) => f.id === familyId)!;
      levelUpEntry(
        db,
        { entryId: entry.id, library, families, clock, rng: rngFor(2) },
        utcInstantFor(DATE, 9),
      );
      const signal = getSignalEventsByType(db, 'level_up_too_easy')[0];
      expect(signal).toBeDefined();
      expect(signal.payload.fromLevelId).toBe(family.levels[0].level_id);
      expect(signal.payload.toLevelId).toBe(family.levels[1].level_id);
    } finally {
      close();
    }
  });

  it('reports at_max at the top of the ladder without changing anything', () => {
    const { db, close, clock } = seedSession();
    try {
      const entry = ladderedEntry(db);
      const familyId = entry.progressionFamilyId as ProgressionFamilyId;
      const family = families.families.find((f) => f.id === familyId)!;
      // Climb to the top, then one more.
      for (let i = 0; i < family.levels.length * 2; i++) {
        const r = levelUpEntry(
          db,
          { entryId: entry.id, library, families, clock, rng: rngFor(i + 1) },
          utcInstantFor(DATE, 9),
        );
        if (r.status === 'at_max' || r.status === 'no_eligible_exercise') break;
      }
      const levelBefore = getAllProgressionStates(db)[familyId].levelId;
      const result = levelUpEntry(
        db,
        { entryId: entry.id, library, families, clock, rng: rngFor(99) },
        utcInstantFor(DATE, 9),
      );
      expect(['at_max', 'no_eligible_exercise']).toContain(result.status);
      expect(getAllProgressionStates(db)[familyId].levelId).toBe(levelBefore);
    } finally {
      close();
    }
  });

  it('reports not_laddered for an accessory entry and leaves the plan alone', () => {
    const { db, close, clock } = seedSession();
    try {
      const accessory = getPendingSession(db)!.entries.find((e) => !e.progressionFamilyId)!;
      const before = accessory.exerciseId;
      const result = levelUpEntry(
        db,
        { entryId: accessory.id, library, families, clock, rng: rngFor(2) },
        utcInstantFor(DATE, 9),
      );
      expect(result.status).toBe('not_laddered');
      const after = getPendingSession(db)!.entries.find((e) => e.id === accessory.id)!;
      expect(after.exerciseId).toBe(before);
    } finally {
      close();
    }
  });
});
