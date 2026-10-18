/**
 * Track 37f — training preferences: stored on the user row (migration 0030), handed to the engine
 * on every generation, and the progression pace honoured at completion.
 */
import { eq } from 'drizzle-orm';
import { DEFAULT_TRAINING_PREFERENCES, FIXED_POINT_ANCHORS } from '@roamfit/engine';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { generate } from '../generation';
import { completeSession } from '../completion';
import { createPendingSession, getPendingSession, logSet, startSession } from './sessions';
import { getAllProgressionStates } from './progressionState';
import { buildUserProfile, ensureUser, getUser, updateUser } from './users';
import {
  clockFor,
  library,
  rngFor,
  singleExerciseFamilies as families,
  utcInstantFor,
} from '../testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

describe('trainingPreferences (migration 0030)', () => {
  it('default to every default, merge on update, and reach the engine profile', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-01')).trainingPreferences).toEqual(
        DEFAULT_TRAINING_PREFERENCES,
      );
      updateUser(db, { trainingPreferences: { goal: 'strength' } }, utcInstantFor('2026-10-02'));
      updateUser(db, { trainingPreferences: { pace: 'patient' } }, utcInstantFor('2026-10-03'));
      expect(getUser(db)!.trainingPreferences).toEqual({
        ...DEFAULT_TRAINING_PREFERENCES,
        goal: 'strength',
        pace: 'patient',
      });
      expect(buildUserProfile(db, '2026-10-03').training).toMatchObject({
        goal: 'strength',
        pace: 'patient',
      });
    } finally {
      close();
    }
  });

  it('falls back to the default for anything damaged', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-10-01'));
      const set = (v: string) =>
        db.update(schema.users).set({ trainingPrefs: v }).where(eq(schema.users.id, 'local')).run();
      set('{not json');
      expect(getUser(db)!.trainingPreferences).toEqual(DEFAULT_TRAINING_PREFERENCES);
      set('{"goal":"powerlifting","rest":"longer","pace":3}');
      expect(getUser(db)!.trainingPreferences).toEqual({
        ...DEFAULT_TRAINING_PREFERENCES,
        rest: 'longer',
      });
    } finally {
      close();
    }
  });
});

function makeSession(db: Db, localDate: string): string {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 45 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(localDate),
  });
  return createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
}

/** Every set of every entry done exactly at target. */
function runAtTarget(db: Db, localDate: string): void {
  const sessionId = makeSession(db, localDate);
  startSession(db, sessionId, utcInstantFor(localDate, 9));
  for (const entry of getPendingSession(db)!.entries) {
    for (let i = 0; i < entry.sets; i++) {
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
          restTakenSec: entry.restSec,
        },
        utcInstantFor(localDate, 9, i * 2),
      );
    }
  }
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
}

describe('the goal reaches generation', () => {
  it('a strength user is prescribed 3 fewer reps than a general one on the same rung', () => {
    const repsFor = (goal: 'general' | 'strength') => {
      const { db, close } = createTestDb();
      try {
        updateUser(db, { anchorsAvailable: [...FIXED_POINT_ANCHORS] }, utcInstantFor('2026-10-01'));
        updateUser(db, { trainingPreferences: { goal } }, utcInstantFor('2026-10-01'));
        makeSession(db, '2026-10-02');
        return getPendingSession(db)!
          .entries.filter((e) => e.section === 'main' && e.progressionFamilyId && e.repTarget)
          .map((e) => [e.progressionFamilyId, e.repTarget] as const);
      } finally {
        close();
      }
    };
    const general = new Map(repsFor('general'));
    const strength = repsFor('strength');
    expect(strength.length).toBeGreaterThan(0);
    for (const [familyId, reps] of strength) {
      if (general.has(familyId)) expect(reps).toBe(general.get(familyId)! - 3);
    }
  });
});

describe('the pace is honoured at completion', () => {
  it('patient: the first qualifying session banks, the second steps', () => {
    const { db, close } = createTestDb();
    try {
      updateUser(db, { trainingPreferences: { pace: 'patient' } }, utcInstantFor('2026-10-01'));
      runAtTarget(db, '2026-10-02');
      const afterFirst = Object.values(getAllProgressionStates(db)).find(
        (s) => s.consecutiveHits === 1,
      );
      expect(afterFirst).toBeDefined();
      const startTarget = afterFirst!.micro.repTarget;
      runAtTarget(db, '2026-10-04');
      const afterSecond = getAllProgressionStates(db)[afterFirst!.familyId];
      expect(afterSecond.consecutiveHits).toBe(0);
      expect(afterSecond.micro).not.toEqual(afterFirst!.micro);
      expect(afterSecond.micro.repTarget).not.toBe(startTarget - 1);
    } finally {
      close();
    }
  });
});
