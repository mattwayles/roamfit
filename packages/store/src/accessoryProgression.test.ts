/**
 * Track 34 — an accessory (main work with no progression family) climbs its own micro-progression
 * ladder: completion moves it, `exercise_state` stores it, and the next prescription reads it.
 */
import { prescribeAccessory } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import { createTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getPendingSession,
  logSet,
  recordEntryFeedback,
  startSession,
} from './repositories/sessions';
import type { SessionEntryRecord } from './repositories/sessions';
import { getAllExerciseStates } from './repositories/exerciseState';
import { completeSession, seedAccessoryProgressionFromHistory } from './completion';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

type Db = ReturnType<typeof createTestDb>['db'];

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

function isBandAccessory(e: SessionEntryRecord): boolean {
  return (
    e.section === 'main' && e.band != null && !e.progressionFamilyId && e.pattern !== 'conditioning'
  );
}

/**
 * Runs a whole session at target. The first band accessory is done on `band` for every set (null =
 * as prescribed), short by one rep/second when `miss`, and rated `feedback`.
 */
function runSession(
  db: Db,
  localDate: string,
  opts: {
    band?: BandId | null;
    miss?: boolean;
    feedback?: 'too_easy' | 'just_right' | 'too_hard';
  } = {},
): SessionEntryRecord {
  const sessionId = makeSession(db, localDate);
  startSession(db, sessionId, utcInstantFor(localDate, 9));
  const session = getPendingSession(db)!;
  const accessory = session.entries.find(isBandAccessory);
  if (!accessory) throw new Error('fixture: expected a band accessory in the session');
  for (const entry of session.entries) {
    const isAccessory = entry.id === accessory.id;
    const short = isAccessory && opts.miss ? 1 : 0;
    for (let i = 0; i < entry.sets; i++) {
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget != null ? entry.repTarget - short : undefined,
          secondsActual: entry.durationSec != null ? entry.durationSec - short : undefined,
          bandActual: isAccessory ? (opts.band ?? entry.band) : entry.band,
          restPrescribedSec: entry.restSec,
        },
        utcInstantFor(localDate, 9, i * 2),
      );
    }
  }
  recordEntryFeedback(
    db,
    accessory.id,
    { difficulty: opts.feedback ?? 'just_right' },
    utcInstantFor(localDate, 9, 30),
  );
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
  return accessory;
}

function exerciseOf(entry: SessionEntryRecord) {
  return library.exercises.find((e) => e.id === entry.exerciseId)!;
}

describe('accessory micro-progression, through the store', () => {
  it('first outing: the table prescription becomes the ladder, and a met session advances it', () => {
    const { db, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01');
      const state = getAllExerciseStates(db)[accessory.exerciseId];
      expect(state.accessoryMicro).not.toBeNull();
      // Medium's 3x12: 12 is the top of 8-12, so a met "just right" session takes the next step —
      // a band, if the record's range has one above, else a slower tempo. Either way, harder.
      const m = state.accessoryMicro!;
      const harder =
        m.band !== accessory.band || m.tempoSec > accessory.tempoSec || m.repTarget > 12;
      expect(harder).toBe(true);
      expect(state.accessoryMisses).toBe(0);
    } finally {
      close();
    }
  });

  it('the user’s report: every set moved up a band and met → the next prescription is on that band, at least as many reps', () => {
    const { db, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01', { band: 'B4' });
      const state = getAllExerciseStates(db)[accessory.exerciseId];
      expect(state.workingBand).toBe('B4');
      const next = prescribeAccessory({
        exercise: exerciseOf(accessory),
        requestedDifficulty: 'medium',
        recoveryTreatment: false,
        workingBand: state.workingBand,
        micro: state.accessoryMicro,
      });
      expect(next.band).toBe('B4');
      expect((next.repTarget ?? next.durationSec)!).toBeGreaterThanOrEqual(
        Math.min(accessory.repTarget ?? accessory.durationSec!, 12),
      );
    } finally {
      close();
    }
  });

  it('too_hard holds; two misses in a row step back down', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01', { feedback: 'too_hard' });
      const held = getAllExerciseStates(db)[accessory.exerciseId];
      expect(held.workingBand).toBe(accessory.band);
      expect(held.accessoryMicro!.repTarget).toBe(12);

      // Two sessions short of target (the second also too_hard): first is tracked, second regresses.
      const id = accessory.exerciseId;
      const before = held.accessoryMicro!;
      const a = programAccessory(db, raw, '2026-03-03', id);
      performOnly(db, a.sessionId, a.entry, '2026-03-03', { short: 1 });
      expect(getAllExerciseStates(db)[id].accessoryMisses).toBe(1);
      const b = programAccessory(db, raw, '2026-03-05', id);
      performOnly(db, b.sessionId, b.entry, '2026-03-05', { short: 1, feedback: 'too_hard' });
      const after = getAllExerciseStates(db)[id].accessoryMicro!;
      expect(after.repTarget).toBeLessThan(before.repTarget);
    } finally {
      close();
    }
  });

  it('a recovery-day band drop, followed as prescribed, is not adopted as the user’s band', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01', { band: 'B3' });
      expect(getAllExerciseStates(db)[accessory.exerciseId].workingBand).toBe('B3');
      // Next time the exercise comes up on a recovery day: prescribed one band lighter, followed.
      const r = programAccessory(db, raw, '2026-03-03', accessory.exerciseId, 'B2');
      performOnly(db, r.sessionId, r.entry, '2026-03-03');
      expect(getAllExerciseStates(db)[accessory.exerciseId].workingBand).not.toBe('B2');
    } finally {
      close();
    }
  });

  it('history from before the ladder is seeded (and its verdict replayed) exactly as completion would have', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01', { band: 'B4' });
      const progressed = getAllExerciseStates(db)[accessory.exerciseId];
      // Rewind to how an install upgraded from before migration 0028 looks: no ladder, and the
      // working band 0027 backfilled (the band finished on).
      raw.exec(
        `UPDATE exercise_state SET micro_rep_target = NULL, micro_tempo_sec = NULL,
           micro_rest_sec = NULL, micro_sets = NULL, micro_consecutive_misses = 0`,
      );
      raw
        .prepare("UPDATE exercise_state SET working_band = 'B4' WHERE exercise_id = ?")
        .run(accessory.exerciseId);
      seedAccessoryProgressionFromHistory(db, library, utcInstantFor('2026-03-02'));
      const seeded = getAllExerciseStates(db)[accessory.exerciseId];
      expect(seeded.accessoryMicro).toEqual(progressed.accessoryMicro);

      // Idempotent: a second run changes nothing.
      seedAccessoryProgressionFromHistory(db, library, utcInstantFor('2026-03-03'));
      expect(getAllExerciseStates(db)[accessory.exerciseId]).toEqual(seeded);
    } finally {
      close();
    }
  });

  it('generate() seeds from history before it reads state', () => {
    const { db, raw, close } = createTestDb();
    try {
      const accessory = runSession(db, '2026-03-01');
      raw.exec('UPDATE exercise_state SET micro_rep_target = NULL');
      expect(getAllExerciseStates(db)[accessory.exerciseId].accessoryMicro).toBeNull();
      makeSession(db, '2026-03-03');
      expect(getAllExerciseStates(db)[accessory.exerciseId].accessoryMicro).not.toBeNull();
    } finally {
      close();
    }
  });
});

/**
 * A session whose only performed work is `exerciseId`, programmed as an accessory exactly as the
 * engine would prescribe it from the stored state (`bandOverride` simulates a recovery-day drop).
 * Selection's variety rules decide whether an exercise comes back, so the test programs it.
 */
function programAccessory(
  db: Db,
  raw: ReturnType<typeof createTestDb>['raw'],
  localDate: string,
  exerciseId: string,
  bandOverride?: BandId,
): { sessionId: string; entry: SessionEntryRecord } {
  const sessionId = makeSession(db, localDate);
  startSession(db, sessionId, utcInstantFor(localDate, 9));
  const slot = getPendingSession(db)!.entries.find((e) => e.section === 'main')!;
  const state = getAllExerciseStates(db)[exerciseId];
  const p = prescribeAccessory({
    exercise: library.exercises.find((e) => e.id === exerciseId)!,
    requestedDifficulty: 'medium',
    recoveryTreatment: false,
    workingBand: state?.workingBand,
    micro: state?.accessoryMicro,
  });
  raw
    .prepare(
      `UPDATE session_entries SET exercise_id = ?, band = ?, sets = ?, rep_target = ?,
         duration_sec = ?, rest_sec = ?, tempo_sec = ?, pattern = ?,
         progression_family_id = NULL, progression_level_id_at_time = NULL WHERE id = ?`,
    )
    .run(
      exerciseId,
      bandOverride ?? p.band,
      p.sets,
      p.repTarget ?? null,
      p.durationSec ?? null,
      p.restSec,
      p.tempoSec,
      p.pattern,
      slot.id,
    );
  return { sessionId, entry: getPendingSession(db)!.entries.find((e) => e.id === slot.id)! };
}

function performOnly(
  db: Db,
  sessionId: string,
  entry: SessionEntryRecord,
  localDate: string,
  opts: { short?: number; band?: BandId; feedback?: 'too_hard' } = {},
): void {
  const short = opts.short ?? 0;
  for (let i = 0; i < entry.sets; i++) {
    logSet(
      db,
      {
        entryId: entry.id,
        setIndex: i,
        status: 'completed',
        repsPrescribed: entry.repTarget ?? undefined,
        repsActual: entry.repTarget != null ? entry.repTarget - short : undefined,
        secondsPrescribed: entry.durationSec ?? undefined,
        secondsActual: entry.durationSec != null ? entry.durationSec - short : undefined,
        bandActual: opts.band ?? entry.band,
        restPrescribedSec: entry.restSec,
      },
      utcInstantFor(localDate, 9, i * 2),
    );
  }
  if (opts.feedback) {
    recordEntryFeedback(
      db,
      entry.id,
      { difficulty: opts.feedback },
      utcInstantFor(localDate, 9, 30),
    );
  }
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
}
