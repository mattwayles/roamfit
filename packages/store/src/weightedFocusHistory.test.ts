/**
 * Track 36 — the history the Recommended Focus reads carries each main entry's completed sets
 * (`loggedSets`), so it can weight them by reps and band instead of counting planned sets.
 */
import { recommendFocus } from '@roamfit/engine';
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  discardSession,
  getHistoryForGeneration,
  getPendingSession,
  logSet,
  startSession,
} from './repositories/sessions';
import { completeSession } from './completion';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];
const DAY = '2026-01-05';

function makeSession(db: Db, localDate = DAY): string {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
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

/** Every main entry: set 0 done 2 over target (the first entry's band reported as B4), set 1
 *  skipped, the rest never reached. */
function runPartly(db: Db, sessionId: string) {
  startSession(db, sessionId, utcInstantFor(DAY, 9));
  const session = getPendingSession(db)!;
  const main = session.entries.filter((e) => e.section === 'main');
  main.forEach((entry, n) => {
    const base = {
      entryId: entry.id,
      repsPrescribed: entry.repTarget ?? undefined,
      secondsPrescribed: entry.durationSec ?? undefined,
      restPrescribedSec: entry.restSec,
    };
    logSet(
      db,
      {
        ...base,
        setIndex: 0,
        status: 'completed',
        repsActual: entry.repTarget != null ? entry.repTarget + 2 : undefined,
        secondsActual: entry.durationSec != null ? entry.durationSec + 2 : undefined,
        bandActual: n === 0 && entry.band ? 'B4' : null,
      },
      utcInstantFor(DAY, 9, n * 4),
    );
    logSet(db, { ...base, setIndex: 1, status: 'skipped' }, utcInstantFor(DAY, 9, n * 4 + 1));
  });
  return main;
}

describe('getHistoryForGeneration — logged sets for the Recommended Focus', () => {
  it('a completed session’s main entries carry only their completed sets, as logged', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const main = runPartly(db, sessionId);
      completeSession(db, { sessionId, library, families }, utcInstantFor(DAY, 10));

      const [record] = getHistoryForGeneration(db);
      expect(main.length).toBeGreaterThan(0);
      main.forEach((entry, n) => {
        const h = record.entries.find((e) => e.exerciseId === entry.exerciseId)!;
        expect(h.sets).toBe(entry.sets); // the plan is still reported
        const seconds = entry.durationSec != null ? entry.durationSec + 2 : null;
        expect(h.loggedSets).toEqual([
          {
            reps: entry.repTarget != null ? entry.repTarget + 2 : null,
            seconds: seconds != null && entry.unilateral ? seconds / 2 : seconds,
            band: n === 0 && entry.band ? 'B4' : entry.band,
          },
        ]);
      });
      for (const e of record.entries.filter((x) => x.role !== 'main')) {
        expect(e.loggedSets).toBeUndefined();
      }
    } finally {
      close();
    }
  });

  it('a completed session with every set skipped trained nothing — no strength data this week', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      startSession(db, sessionId, utcInstantFor(DAY, 9));
      for (const entry of getPendingSession(db)!.entries) {
        for (let i = 0; i < entry.sets; i++) {
          logSet(
            db,
            { entryId: entry.id, setIndex: i, status: 'skipped', restPrescribedSec: entry.restSec },
            utcInstantFor(DAY, 9, i),
          );
        }
      }
      completeSession(db, { sessionId, library, families }, utcInstantFor(DAY, 10));
      const history = getHistoryForGeneration(db);
      const main = history[0].entries.filter((e) => e.role === 'main');
      expect(main.length).toBeGreaterThan(0);
      expect(main.every((e) => e.loggedSets?.length === 0)).toBe(true);
      // Planned-set counting called this an upper week; nothing was actually done.
      expect(recommendFocus(history, library.exercises, DAY).reason).toBe('no_strength_data');
    } finally {
      close();
    }
  });

  it('a discarded session reads no set logs', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      runPartly(db, sessionId);
      discardSession(db, sessionId, {}, utcInstantFor(DAY, 10));
      const [record] = getHistoryForGeneration(db);
      expect(record.status).toBe('discarded');
      expect(record.entries.every((e) => e.loggedSets === undefined)).toBe(true);
    } finally {
      close();
    }
  });
});
