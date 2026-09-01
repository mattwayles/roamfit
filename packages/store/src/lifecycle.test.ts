import { createTestDb, createFileTestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  discardSession,
  getHistoryForGeneration,
  getPendingSession,
  getSession,
  logSet,
  PendingSessionExistsError,
  recordSwap,
  removeEntryAtApproval,
  reorderEntriesAtApproval,
  startSession,
} from './repositories/sessions';
import { getSignalEventsForSession } from './repositories/signals';
import { getExerciseState } from './repositories/exerciseState';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

function makeSession(db: ReturnType<typeof createTestDb>['db'], localDate = '2026-01-05') {
  const clock = clockFor(localDate);
  const result = generate(db, {
    library,
    families,
    request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(localDate),
  });
  const id = createPendingSession(db, {
    plan: result.plan,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier: result.comebackTier,
    recoveryWeekManual: result.recoveryWeekManual,
  });
  return { id, plan: result.plan };
}

describe('§10.10 single pending session', () => {
  it('only one pending session may exist — a second create throws', () => {
    const { db, close } = createTestDb();
    try {
      makeSession(db);
      expect(() => makeSession(db)).toThrow(PendingSessionExistsError);
    } finally {
      close();
    }
  });

  it('discarding the pending session frees the slot for a new one', () => {
    const { db, close } = createTestDb();
    try {
      const { id } = makeSession(db);
      discardSession(db, id, {}, utcInstantFor('2026-01-05', 9));
      expect(getPendingSession(db)).toBeNull();
      expect(() => makeSession(db)).not.toThrow();
    } finally {
      close();
    }
  });

  it('nothing reaches getHistoryForGeneration except via completion or discard — a planned session is invisible to it', () => {
    const { db, close } = createTestDb();
    try {
      makeSession(db);
      expect(getHistoryForGeneration(db)).toHaveLength(0);
    } finally {
      close();
    }
  });
});

describe('crash safety — force-quit mid-session resumes at the exact set', () => {
  it('reconstructs in-progress state purely from set_logs rows after simulating a force-quit', () => {
    // File-backed (not :memory:) so we can actually close the connection and cold-reopen the
    // same file — an in-memory db discards everything on close, so it can never prove
    // durability (carried-forward issue #10, docs/ORCHESTRATION.md).
    let dbFile = createFileTestDb();
    const localDate = '2026-01-05';
    const { id: sessionId } = makeSession(dbFile.db, localDate);
    startSession(dbFile.db, sessionId, utcInstantFor(localDate, 9));

    const session = getSession(dbFile.db, sessionId)!;
    const firstEntry = session.entries.find((e) => e.section === 'main')!;

    // Log set 0 and set 1 of the first main entry — this simulates the user completing two sets.
    logSet(
      dbFile.db,
      {
        entryId: firstEntry.id,
        setIndex: 0,
        status: 'completed',
        repsPrescribed: firstEntry.repTarget ?? undefined,
        repsActual: firstEntry.repTarget ?? 10,
        restPrescribedSec: firstEntry.restSec,
        restTakenSec: firstEntry.restSec,
      },
      utcInstantFor(localDate, 9, 5),
    );
    logSet(
      dbFile.db,
      {
        entryId: firstEntry.id,
        setIndex: 1,
        status: 'completed',
        repsPrescribed: firstEntry.repTarget ?? undefined,
        repsActual: firstEntry.repTarget ?? 10,
        restPrescribedSec: firstEntry.restSec,
        restTakenSec: firstEntry.restSec,
      },
      utcInstantFor(localDate, 9, 10),
    );

    // "Force-quit": close this connection entirely (discarding anything an in-memory harness
    // would have kept alive) and open a brand-new connection against the same on-disk file —
    // exactly what a cold app relaunch after a force-quit does. Resume by re-reading the
    // session fresh through the new connection.
    dbFile = dbFile.reopen();
    const resumed = getSession(dbFile.db, sessionId)!;
    const resumedEntry = resumed.entries.find((e) => e.id === firstEntry.id)!;
    expect(resumedEntry.setLogs.map((s) => s.setIndex)).toEqual([0, 1]);
    expect(resumedEntry.setLogs.every((s) => s.status === 'completed')).toBe(true);
    // The next set to run is unambiguous: one past the highest logged index.
    const nextSetIndex = Math.max(...resumedEntry.setLogs.map((s) => s.setIndex)) + 1;
    expect(nextSetIndex).toBe(2);
    expect(resumed.status).toBe('active');
    expect(getPendingSession(dbFile.db)?.id).toBe(sessionId);

    dbFile.close();
  });
});

describe('planned-vs-actual is preserved, not overwritten', () => {
  it('a mid-workout swap updates exercise_id but plannedExerciseId (and the signal event) still name the original', () => {
    const { db, close } = createTestDb();
    try {
      const { id: sessionId } = makeSession(db);
      const session = getSession(db, sessionId)!;
      const entry = session.entries.find((e) => e.section === 'main')!;
      const originalExerciseId = entry.plannedExerciseId;
      const swapTarget = library.exercises.find(
        (e) => e.pattern === entry.pattern && e.id !== originalExerciseId,
      );
      if (!swapTarget) return; // pattern pool too thin in this fixture — not the point under test

      recordSwap(
        db,
        entry.id,
        {
          exerciseId: swapTarget.id,
          band: entry.band,
          sets: entry.sets,
          repTarget: entry.repTarget ?? undefined,
          durationSec: entry.durationSec ?? undefined,
          restSec: entry.restSec,
          tempoSec: entry.tempoSec,
          notes: entry.notes ?? undefined,
          effort: entry.effort,
          progressionFamilyId: null,
          progressionLevelIdAtTime: null,
          pattern: swapTarget.pattern,
          anchorClass: swapTarget.anchor_class,
          unilateral: swapTarget.unilateral,
          estimatedSec: entry.estimatedSec,
          substitutedFor: originalExerciseId,
        },
        0,
        utcInstantFor('2026-01-05', 10),
      );

      const after = getSession(db, sessionId)!;
      const afterEntry = after.entries.find((e) => e.id === entry.id)!;
      expect(afterEntry.plannedExerciseId).toBe(originalExerciseId);
      expect(afterEntry.exerciseId).toBe(swapTarget.id);
      expect(afterEntry.plannedExerciseId).not.toBe(afterEntry.exerciseId);

      const swapExerciseState = getExerciseState(db, originalExerciseId);
      expect(swapExerciseState?.swapAwayCount).toBe(1);
    } finally {
      close();
    }
  });

  it('an exercise removed at approval keeps its row (entry_status flips, nothing is deleted)', () => {
    const { db, close } = createTestDb();
    try {
      const { id: sessionId } = makeSession(db);
      const session = getSession(db, sessionId)!;
      const entry = session.entries.find((e) => e.section === 'main')!;

      removeEntryAtApproval(db, entry.id, utcInstantFor('2026-01-05', 8, 30));

      const after = getSession(db, sessionId)!;
      const afterEntry = after.entries.find((e) => e.id === entry.id)!;
      expect(afterEntry).toBeDefined();
      expect(afterEntry.entryStatus).toBe('removed_at_approval');
      expect(getExerciseState(db, entry.exerciseId)?.removeAtApprovalCount).toBe(1);
    } finally {
      close();
    }
  });
});

describe('§10.3 re-order at approval — section-scoped', () => {
  it('reversing a section persists the new order and round-trips through getSession', () => {
    const { db, close } = createTestDb();
    try {
      const { id: sessionId } = makeSession(db);
      const before = getSession(db, sessionId)!;
      const mainIds = before.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      if (mainIds.length < 2) return; // fixture too thin for this assertion to mean anything

      const reversed = [...mainIds].reverse();
      reorderEntriesAtApproval(db, sessionId, 'main', reversed, utcInstantFor('2026-01-05', 8));

      const after = getSession(db, sessionId)!;
      const afterMainIds = after.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      expect(afterMainIds).toEqual(reversed);
      expect(afterMainIds).not.toEqual(mainIds);

      // Warmup/cooldown order and orderIndex bands are untouched by a main-section reorder.
      const warmupIdsBefore = before.entries.filter((e) => e.section === 'warmup').map((e) => e.id);
      const warmupIdsAfter = after.entries.filter((e) => e.section === 'warmup').map((e) => e.id);
      expect(warmupIdsAfter).toEqual(warmupIdsBefore);

      // §8.3 signal recorded.
      const events = getSignalEventsForSession(db, sessionId).filter(
        (e) => e.type === 'reorder_at_approval',
      );
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ section: 'main', orderedEntryIds: reversed });
    } finally {
      close();
    }
  });

  it('warm-ups can never sort after main work — a cross-section id list is refused as a no-op', () => {
    const { db, close } = createTestDb();
    try {
      const { id: sessionId } = makeSession(db);
      const before = getSession(db, sessionId)!;
      const mainIds = before.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      const warmupEntry = before.entries.find((e) => e.section === 'warmup')!;

      // Smuggle a warmup entry id into a "main" reorder call — this must not move it into the
      // main section's orderIndex band. Without the validation this is exactly the bug class
      // that would let a warm-up sort after main work.
      const tampered = [warmupEntry.id, ...mainIds.slice(1)];
      reorderEntriesAtApproval(db, sessionId, 'main', tampered, utcInstantFor('2026-01-05', 8));

      const after = getSession(db, sessionId)!;
      const afterMainIds = after.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      // Unchanged — the malformed call was a no-op.
      expect(afterMainIds).toEqual(mainIds);
      const afterWarmupEntry = after.entries.find((e) => e.id === warmupEntry.id)!;
      expect(afterWarmupEntry.section).toBe('warmup');
      expect(afterWarmupEntry.orderIndex).toBe(warmupEntry.orderIndex);

      expect(
        getSignalEventsForSession(db, sessionId).filter((e) => e.type === 'reorder_at_approval'),
      ).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('a partial or wrong-length id list is refused as a no-op', () => {
    const { db, close } = createTestDb();
    try {
      const { id: sessionId } = makeSession(db);
      const before = getSession(db, sessionId)!;
      const mainIds = before.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      if (mainIds.length < 2) return;

      reorderEntriesAtApproval(
        db,
        sessionId,
        'main',
        mainIds.slice(0, mainIds.length - 1), // missing one id
        utcInstantFor('2026-01-05', 8),
      );

      const after = getSession(db, sessionId)!;
      const afterMainIds = after.entries
        .filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval')
        .map((e) => e.id);
      expect(afterMainIds).toEqual(mainIds);
    } finally {
      close();
    }
  });
});
