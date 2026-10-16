/**
 * Which band was intended (approval) and which was actually used (per set, mid-workout), and the
 * one thing that makes recording either worth doing: the next session is built around the band the
 * user really trained with.
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  adjustBandAtApproval,
  createPendingSession,
  getPendingSession,
  getSession,
  logSet,
  startSession,
} from './repositories/sessions';
import type { SessionEntryRecord } from './repositories/sessions';
import type { ProgressionFamilyId } from '@roamfit/data';
import { getSignalEventsByType } from './repositories/signals';
import { getAllProgressionStates } from './repositories/progressionState';
import { getAllExerciseStates } from './repositories/exerciseState';
import { completeSession } from './completion';
import { MIGRATIONS } from './migrations/data';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

function makeSession(db: Db, localDate = '2026-03-01'): string {
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

/** A generated main entry that carries a band and a progression family — the only shape where any
 *  of this is meaningful. `generate` is seeded, so this is deterministic. */
function bandedEntry(db: Db): SessionEntryRecord {
  const entry = getPendingSession(db)!.entries.find(
    (e) => e.section === 'main' && e.band != null && e.progressionFamilyId != null,
  );
  if (!entry) throw new Error('fixture: expected the generated session to contain a banded entry');
  return entry;
}

describe('§10.3 — the intended band, changed at approval', () => {
  it('is applied to the plan and logged with the band it replaced', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const entry = bandedEntry(db);
      const target = entry.band === 'B5' ? 'B4' : 'B5';

      adjustBandAtApproval(db, entry.id, target, utcInstantFor('2026-03-01', 8, 20));

      const after = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(after.band).toBe(target);
      const events = getSignalEventsByType(db, 'band_adjusted_at_approval');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ fromBand: entry.band, toBand: target });
    } finally {
      close();
    }
  });

  it('will not invent a band for a bodyweight entry, and no-ops on an unchanged one', () => {
    const { db, close } = createTestDb();
    try {
      makeSession(db);
      const bodyweight = getPendingSession(db)!.entries.find((e) => e.band == null)!;
      adjustBandAtApproval(db, bodyweight.id, 'B3', utcInstantFor('2026-03-01', 8, 21));
      expect(getPendingSession(db)!.entries.find((e) => e.id === bodyweight.id)!.band).toBeNull();

      const banded = bandedEntry(db);
      adjustBandAtApproval(db, banded.id, banded.band!, utcInstantFor('2026-03-01', 8, 22));
      expect(getSignalEventsByType(db, 'band_adjusted_at_approval')).toHaveLength(0);
    } finally {
      close();
    }
  });
});

describe('§10.5 — the band actually used, recorded per set', () => {
  it('is stored on the set log, per set, leaving the entry’s prescription intact', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      startSession(db, sessionId, utcInstantFor('2026-03-01', 9));
      const entry = bandedEntry(db);

      // Started on the prescribed band, finished heavier — exactly the case a per-entry column
      // could not represent.
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: 0,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        utcInstantFor('2026-03-01', 9, 5),
      );
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: 1,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          bandActual: 'B4',
          restPrescribedSec: entry.restSec,
        },
        utcInstantFor('2026-03-01', 9, 8),
      );

      const after = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(after.band).toBe(entry.band); // the plan is not rewritten by what happened
      expect(after.setLogs.find((s) => s.setIndex === 0)!.bandActual).toBeNull();
      expect(after.setLogs.find((s) => s.setIndex === 1)!.bandActual).toBe('B4');
    } finally {
      close();
    }
  });
});

describe('the recorded band informs the next session', () => {
  /** Runs every set of every entry at target, reporting `bandActual` on the banded entry. */
  function runSessionUsingBand(db: Db, localDate: string, bandActual: 'B1' | 'B5' | null) {
    const sessionId = makeSession(db, localDate);
    startSession(db, sessionId, utcInstantFor(localDate, 9));
    const session = getPendingSession(db)!;
    const banded = session.entries.find(
      (e) => e.section === 'main' && e.band != null && e.progressionFamilyId != null,
    )!;
    for (const entry of session.entries) {
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
            bandActual: entry.id === banded.id ? bandActual : null,
            restPrescribedSec: entry.restSec,
            restTakenSec: entry.restSec,
          },
          utcInstantFor(localDate, 9, i * 2),
        );
      }
    }
    completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
    return banded;
  }

  it('a heavier band than prescribed is adopted into progression state', () => {
    const { db, close } = createTestDb();
    try {
      const banded = runSessionUsingBand(db, '2026-03-01', 'B5');
      const state = getAllProgressionStates(db)[banded.progressionFamilyId as ProgressionFamilyId];
      // Clamped to the top of the exercise's own suggested range rather than taken literally, so
      // the assertion is "heavier than what was prescribed", not "exactly B5".
      expect(state.micro.band).not.toBe(banded.band);
      expect(state.micro.band! > banded.band!).toBe(true);
    } finally {
      close();
    }
  });

  it('reporting nothing leaves progression state exactly where following the plan leaves it', () => {
    const reported = createTestDb();
    const silent = createTestDb();
    try {
      const banded = runSessionUsingBand(reported.db, '2026-03-01', null);
      runSessionUsingBand(silent.db, '2026-03-01', null);
      const a = getAllProgressionStates(reported.db)[
        banded.progressionFamilyId as ProgressionFamilyId
      ];
      const b = getAllProgressionStates(silent.db)[
        banded.progressionFamilyId as ProgressionFamilyId
      ];
      expect(a.micro).toEqual(b.micro);
      expect(a.micro.band).toBe(banded.band);
    } finally {
      reported.close();
      silent.close();
    }
  });

  it('a best set is recorded against the band it was actually performed with', () => {
    const { db, close } = createTestDb();
    try {
      const banded = runSessionUsingBand(db, '2026-03-01', 'B5');
      const state = getAllExerciseStates(db)[banded.exerciseId];
      expect(state.bestSet?.band).not.toBe(banded.band);
      expect(state.bestSet?.band).toBe('B5');
    } finally {
      close();
    }
  });
});

describe('an accessory remembers the band the user finished on', () => {
  /** The user's report: Single-Arm Curl (no progression family) prescribed B1, moved up mid-workout,
   *  rated just right — and handed B1 again next time. Runs every set at target; the first
   *  band-carrying accessory entry finishes on `finalBand` (earlier sets at `earlierBand`). */
  function runSessionMovingAccessoryUp(
    db: Db,
    localDate: string,
    earlierBand: 'B4' | null,
    finalBand: 'B4',
  ) {
    const sessionId = makeSession(db, localDate);
    startSession(db, sessionId, utcInstantFor(localDate, 9));
    const session = getPendingSession(db)!;
    const accessory = session.entries.find(
      (e) => e.section === 'main' && e.band != null && e.progressionFamilyId == null,
    );
    if (!accessory) throw new Error('fixture: expected a banded accessory in the session');
    for (const entry of session.entries) {
      for (let i = 0; i < entry.sets; i++) {
        const isAccessory = entry.id === accessory.id;
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
            bandActual: isAccessory ? (i === entry.sets - 1 ? finalBand : earlierBand) : null,
            restPrescribedSec: entry.restSec,
            restTakenSec: entry.restSec,
          },
          utcInstantFor(localDate, 9, i * 2),
        );
      }
    }
    completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
    return accessory;
  }

  it('every set moved up: the stored working band is the band used', () => {
    const { db, close } = createTestDb();
    try {
      const accessory = runSessionMovingAccessoryUp(db, '2026-03-01', 'B4', 'B4');
      expect(accessory.band).not.toBe('B4');
      expect(getAllExerciseStates(db)[accessory.exerciseId].workingBand).toBe('B4');
    } finally {
      close();
    }
  });

  it('only the final set moved up: still the band finished on, not a majority vote', () => {
    const { db, close } = createTestDb();
    try {
      const accessory = runSessionMovingAccessoryUp(db, '2026-03-01', null, 'B4');
      expect(getAllExerciseStates(db)[accessory.exerciseId].workingBand).toBe('B4');
    } finally {
      close();
    }
  });

  it('following the plan stores the prescribed band', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      startSession(db, sessionId, utcInstantFor('2026-03-01', 9));
      const session = getPendingSession(db)!;
      for (const entry of session.entries) {
        for (let i = 0; i < entry.sets; i++) {
          logSet(
            db,
            {
              entryId: entry.id,
              setIndex: i,
              status: 'completed',
              repsActual: entry.repTarget ?? undefined,
              secondsActual: entry.durationSec ?? undefined,
              restPrescribedSec: entry.restSec,
            },
            utcInstantFor('2026-03-01', 9, i * 2),
          );
        }
      }
      completeSession(db, { sessionId, library, families }, utcInstantFor('2026-03-01', 10));
      const states = getAllExerciseStates(db);
      for (const entry of session.entries) {
        if (entry.section !== 'main') continue;
        expect(states[entry.exerciseId].workingBand).toBe(entry.band);
      }
    } finally {
      close();
    }
  });

  it('a warm-up never overwrites the working band with its lighter warm-up band', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSessionMovingAccessoryUp(db, '2026-03-01', 'B4', 'B4');
      // A later session that only warms the same exercise up, on B1.
      const sessionId = makeSession(db, '2026-03-03');
      startSession(db, sessionId, utcInstantFor('2026-03-03', 9));
      const warmup = getPendingSession(db)!.entries.find((e) => e.section === 'warmup')!;
      raw
        .prepare("UPDATE session_entries SET exercise_id = ?, band = 'B1' WHERE id = ?")
        .run(accessory.exerciseId, warmup.id);
      logSet(
        db,
        {
          entryId: warmup.id,
          setIndex: 0,
          status: 'completed',
          repsActual: 12,
          restPrescribedSec: 30,
        },
        utcInstantFor('2026-03-03', 9, 1),
      );
      completeSession(db, { sessionId, library, families }, utcInstantFor('2026-03-03', 10));
      expect(getAllExerciseStates(db)[accessory.exerciseId].workingBand).toBe('B4');
    } finally {
      close();
    }
  });

  it('migration 0027 backfills the working band from history already logged', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSessionMovingAccessoryUp(db, '2026-03-01', null, 'B4');
      raw.exec('UPDATE exercise_state SET working_band = NULL');
      const migration = MIGRATIONS.find((m) => m.id === '0027_working_band.sql')!;
      raw.exec(migration.sql.replace(/ALTER TABLE[^;]*;/, ''));
      const states = getAllExerciseStates(db);
      expect(states[accessory.exerciseId].workingBand).toBe('B4');
      // Every other main exercise backfills to the band it was prescribed.
      const session = getSession(db, getSessionIdFor(raw))!;
      for (const entry of session.entries) {
        if (entry.section !== 'main' || entry.id === accessory.id) continue;
        expect(states[entry.exerciseId].workingBand).toBe(entry.band);
      }
    } finally {
      close();
    }
  });
});

function getSessionIdFor(raw: ReturnType<typeof createTestDb>['raw']): string {
  return (raw.prepare("SELECT id FROM sessions WHERE status = 'completed'").get() as { id: string })
    .id;
}
