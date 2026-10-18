/**
 * Track 37f — the changeover allowance is learned from the user's own completed sessions and then
 * used by every generation.
 */
import { createTestDb } from '../testHarness';
import { generate } from '../generation';
import { completeSession } from '../completion';
import {
  createPendingSession,
  getPendingSession,
  learnedChangeoverSec,
  logSet,
  startSession,
} from './sessions';
import {
  clockFor,
  library,
  rngFor,
  singleExerciseFamilies as families,
  utcInstantFor,
} from '../testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

function plan(db: Db, localDate: string) {
  const clock = clockFor(localDate);
  return generate(db, {
    library,
    families,
    request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: rngFor(2),
    utcInstant: utcInstantFor(localDate),
  });
}

/** Train one session from 09:00, finishing the last set at 09:`endMinute`. `skipOne` skips a set. */
function train(db: Db, localDate: string, endMinute: number, skipOne = false): void {
  const clock = clockFor(localDate);
  const { plan: p, comebackTier, recoveryWeekManual } = plan(db, localDate);
  const sessionId = createPendingSession(db, {
    plan: p,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  startSession(db, sessionId, utcInstantFor(localDate, 9));
  const entries = getPendingSession(db)!.entries;
  entries.forEach((entry, ei) => {
    for (let i = 0; i < entry.sets; i++) {
      const last = ei === entries.length - 1 && i === entry.sets - 1;
      const skipped = skipOne && ei === 0 && i === 0;
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: skipped ? 'skipped' : 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
          completedAt: skipped
            ? undefined
            : utcInstantFor(localDate, 9, last ? endMinute : Math.min(endMinute - 1, ei)),
        },
        utcInstantFor(localDate, 9, ei),
      );
    }
  });
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 11));
}

describe('learnedChangeoverSec', () => {
  it('stays at the default until three fully completed sessions exist', () => {
    const { db, close } = createTestDb();
    try {
      expect(learnedChangeoverSec(db)).toBeUndefined();
      train(db, '2026-10-01', 50);
      train(db, '2026-10-03', 50);
      expect(learnedChangeoverSec(db)).toBeUndefined();
      train(db, '2026-10-05', 50, true); // a skipped set: not a pace sample
      expect(learnedChangeoverSec(db)).toBeUndefined();
    } finally {
      close();
    }
  });

  it('a user who runs long learns a longer changeover, clamped, and generation uses it', () => {
    const { db, close } = createTestDb();
    try {
      for (const d of ['2026-10-01', '2026-10-03', '2026-10-05']) train(db, d, 55);
      const learned = learnedChangeoverSec(db)!;
      expect(learned).toBeGreaterThan(60);
      expect(learned).toBeLessThanOrEqual(150);
      expect(learned % 5).toBe(0);
      const next = plan(db, '2026-10-07').plan;
      expect(next.main.every((e) => e.transitionSec === learned)).toBe(true);
    } finally {
      close();
    }
  });

  it('a user who runs short learns a shorter one, never below 30s', () => {
    const { db, close } = createTestDb();
    try {
      for (const d of ['2026-10-01', '2026-10-03', '2026-10-05']) train(db, d, 12);
      const learned = learnedChangeoverSec(db)!;
      expect(learned).toBeLessThan(60);
      expect(learned).toBeGreaterThanOrEqual(30);
    } finally {
      close();
    }
  });
});
