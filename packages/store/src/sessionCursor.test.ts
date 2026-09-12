/**
 * The "you are here" override (migration 0016). Tapping a set from Summary is a user selection,
 * not the §10.8 crash-safety resume `findCurrentEntry` derives from `set_logs` — it has to
 * survive leaving the screen, so it lives on the row, same reasoning as the pause fields in
 * `sessionPause.test.ts`.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getSession,
  setSessionCursor,
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

describe('the persisted "you are here" override', () => {
  it('defaults to null — no override until one is set', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const session = getSession(db, sessionId)!;
      expect(session.cursorEntryId).toBeNull();
      expect(session.cursorSetIndex).toBeNull();
    } finally {
      close();
    }
  });

  it('persists an explicit selection, surviving a fresh read of the row', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const entryId = getSession(db, sessionId)!.entries[0].id;
      setSessionCursor(db, sessionId, { entryId, setIndex: 1 }, utcInstantFor(DATE));

      const reloaded = getSession(db, sessionId)!;
      expect(reloaded.cursorEntryId).toBe(entryId);
      expect(reloaded.cursorSetIndex).toBe(1);
    } finally {
      close();
    }
  });

  it('clears back to null — the "no override, fall back to the derived front edge" state', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = startedSession(db);
      const entryId = getSession(db, sessionId)!.entries[0].id;
      setSessionCursor(db, sessionId, { entryId, setIndex: 1 }, utcInstantFor(DATE));
      setSessionCursor(db, sessionId, null, utcInstantFor(DATE));

      const reloaded = getSession(db, sessionId)!;
      expect(reloaded.cursorEntryId).toBeNull();
      expect(reloaded.cursorSetIndex).toBeNull();
    } finally {
      close();
    }
  });
});
