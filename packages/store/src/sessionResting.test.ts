/**
 * The persisted rest page (migration 0021). Which set the user just finished and is now resting
 * after used to be component state on the workout screen — lost the moment the screen unmounted,
 * which is exactly what the "Progress" button does (it `replace`s Workout with Summary). Same
 * reasoning as `sessionCursor.test.ts` and `sessionPause.test.ts`: it lives on the row instead.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getSession,
  restElapsedSec,
  setRestingCursor,
  startSession,
} from './repositories/sessions';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

const DATE = '2026-03-01';

function startedSession(db: Db): string {
  const clock = clockFor(DATE);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
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
  startSession(db, sessionId, utcInstantFor(DATE));
  return sessionId;
}

describe('the persisted rest page', () => {
  it('defaults to null — not resting until a rest page sets it', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const session = getSession(db, sessionId)!;
      expect(session.restingEntryId).toBeNull();
      expect(session.restingSetIndex).toBeNull();
      expect(session.restingStartedAt).toBeNull();
    } finally {
      close();
    }
  });

  it('persists the set just finished and when its rest began, surviving a fresh read of the row', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const entryId = getSession(db, sessionId)!.entries[0].id;
      const startedAt = utcInstantFor(DATE);
      setRestingCursor(db, sessionId, { entryId, setIndex: 0 }, startedAt);

      const reloaded = getSession(db, sessionId)!;
      expect(reloaded.restingEntryId).toBe(entryId);
      expect(reloaded.restingSetIndex).toBe(0);
      expect(reloaded.restingStartedAt).toBe(startedAt);
    } finally {
      close();
    }
  });

  it('clears back to null — the "not resting" state Next leaves the row in', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const entryId = getSession(db, sessionId)!.entries[0].id;
      setRestingCursor(db, sessionId, { entryId, setIndex: 0 }, utcInstantFor(DATE));
      setRestingCursor(db, sessionId, null, utcInstantFor(DATE));

      const reloaded = getSession(db, sessionId)!;
      expect(reloaded.restingEntryId).toBeNull();
      expect(reloaded.restingSetIndex).toBeNull();
      expect(reloaded.restingStartedAt).toBeNull();
    } finally {
      close();
    }
  });
});

describe('restElapsedSec', () => {
  it('is the whole-second gap between two instants', () => {
    expect(restElapsedSec('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:45.000Z')).toBe(45);
  });

  it('never goes negative — a clock read slightly before the start instant reads as zero', () => {
    expect(restElapsedSec('2026-03-01T00:00:10.000Z', '2026-03-01T00:00:00.000Z')).toBe(0);
  });
});
