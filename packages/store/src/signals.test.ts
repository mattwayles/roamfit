/**
 * §8.3 implicit-signal capture — one test per item on the checklist in STATUS-3-persistence.md
 * that isn't already exercised by lifecycle.test.ts (removal at approval, mid-workout swap) or
 * simulation.test.ts (reps/seconds vs prescribed, set status, best-set improvement, session
 * duration vs estimate, history).
 */
import { createTestDb } from './testHarness';
import { generate } from './generation';
import { prescribeAccessory } from '@roamfit/engine';
import {
  addEntryAtApproval,
  adjustRepTargetAtApproval,
  adjustSetsAtApproval,
  createPendingSession,
  discardSession,
  getPendingSession,
  getSession,
  logSet,
  recordDemoMediaExpanded,
  recordEntryFeedback,
  recordRegenerateTap,
  startSession,
} from './repositories/sessions';
import { consecutiveRegenerateTapCount, getSignalEventsByType } from './repositories/signals';
import { setPinnedNote } from './repositories/exerciseState';
import { observeTzId } from './repositories/users';
import { recordTravelDay, getStats, effectiveWeeklyDenominator } from './repositories/stats';
import { library, families, clockFor, rngFor, utcInstantFor } from './testFixtures';

function makeSession(db: ReturnType<typeof createTestDb>['db'], localDate = '2026-03-01') {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(localDate),
  });
  const id = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  return id;
}

describe('§8.3 fatigue & pacing signals', () => {
  it('rest taken vs prescribed, +15s tap count, pause count/duration, and time-under-set are all stored per set', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      startSession(db, sessionId, utcInstantFor('2026-03-01', 9));
      const entry = getPendingSession(db)!.entries.find((e) => e.section === 'main')!;

      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: 0,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          startedAt: utcInstantFor('2026-03-01', 9, 0),
          completedAt: utcInstantFor('2026-03-01', 9, 1),
          restPrescribedSec: entry.restSec,
          restTakenSec: entry.restSec + 30, // took an extra 30s of rest
          restExtendedCount: 2, // tapped "+15s" twice
          pauseCount: 1,
          pausedDurationSec: 12,
        },
        utcInstantFor('2026-03-01', 9, 2),
      );

      const setLog = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!.setLogs[0];
      expect(setLog.restTakenSec).toBe(entry.restSec + 30);
      expect(setLog.restExtendedCount).toBe(2);
      expect(setLog.pauseCount).toBe(1);
      expect(setLog.pausedDurationSec).toBe(12);
      expect(setLog.startedAt).toBe(utcInstantFor('2026-03-01', 9, 0));
      expect(setLog.completedAt).toBe(utcInstantFor('2026-03-01', 9, 1));
    } finally {
      close();
    }
  });
});

describe('§8.3 preference & aversion / comprehension signals', () => {
  it('regenerate taps are counted, including how many in a row', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      recordRegenerateTap(db, sessionId, utcInstantFor('2026-03-01', 8, 10));
      recordRegenerateTap(db, sessionId, utcInstantFor('2026-03-01', 8, 11));
      recordRegenerateTap(db, sessionId, utcInstantFor('2026-03-01', 8, 12));

      expect(getSession(db, sessionId)!.regenerateTapCount).toBe(3);
      expect(consecutiveRegenerateTapCount(db, sessionId)).toBe(3);
    } finally {
      close();
    }
  });

  it('sets added or deleted at approval are both applied and logged with the original count', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const entry = getPendingSession(db)!.entries.find((e) => e.section === 'main')!;
      const originalSets = entry.sets;

      adjustSetsAtApproval(db, entry.id, originalSets + 1, utcInstantFor('2026-03-01', 8, 20));
      const afterAdd = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(afterAdd.sets).toBe(originalSets + 1);

      adjustSetsAtApproval(db, entry.id, originalSets, utcInstantFor('2026-03-01', 8, 21));
      const afterDelete = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(afterDelete.sets).toBe(originalSets);

      const added = getSignalEventsByType(db, 'set_added_at_approval');
      const deleted = getSignalEventsByType(db, 'set_deleted_at_approval');
      expect(added).toHaveLength(1);
      expect(added[0].payload).toMatchObject({ fromSets: originalSets, toSets: originalSets + 1 });
      expect(deleted).toHaveLength(1);
      expect(deleted[0].payload).toMatchObject({
        fromSets: originalSets + 1,
        toSets: originalSets,
      });
    } finally {
      close();
    }
  });

  it('rep target adjustment at approval is applied and logged with the original value', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const entry = getPendingSession(db)!
        .entries.filter((e) => e.section === 'main')
        .find((e) => e.repTarget != null)!;
      const originalRepTarget = entry.repTarget!;

      adjustRepTargetAtApproval(
        db,
        entry.id,
        originalRepTarget + 3,
        utcInstantFor('2026-03-01', 8, 25),
      );
      const after = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(after.repTarget).toBe(originalRepTarget + 3);

      const events = getSignalEventsByType(db, 'rep_target_adjusted_at_approval');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        fromRepTarget: originalRepTarget,
        toRepTarget: originalRepTarget + 3,
      });
    } finally {
      close();
    }
  });

  it('adding an exercise at approval persists the engine prescription verbatim and is logged', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const before = getPendingSession(db)!;
      const mainCountBefore = before.entries.filter((e) => e.section === 'main').length;

      const newExercise = library.exercises.find(
        (e) =>
          e.roles.includes('main') && !before.entries.some((entry) => entry.exerciseId === e.id),
      )!;
      const prescription = prescribeAccessory({
        exercise: newExercise,
        requestedEffort: 'normal',
        recoveryTreatment: false,
      });

      const entryId = addEntryAtApproval(
        db,
        sessionId,
        'main',
        prescription,
        utcInstantFor('2026-03-01', 8, 30),
      );

      const after = getSession(db, sessionId)!;
      const added = after.entries.find((e) => e.id === entryId)!;
      expect(added).toBeDefined();
      expect(added.exerciseId).toBe(newExercise.id);
      expect(added.unplanned).toBe(true);
      expect(added.entryStatus).toBe('unplanned_added');
      expect(added.sets).toBe(prescription.sets);
      expect(added.repTarget ?? null).toBe(prescription.repTarget ?? null);
      expect(after.entries.filter((e) => e.section === 'main')).toHaveLength(mainCountBefore + 1);

      const events = getSignalEventsByType(db, 'add_at_approval');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ entryId, exerciseId: newExercise.id });
    } finally {
      close();
    }
  });

  it('demo media expansion is recorded on the entry and as a signal event', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const entry = getPendingSession(db)!.entries.find((e) => e.section === 'main')!;
      recordDemoMediaExpanded(db, entry.id, utcInstantFor('2026-03-01', 8, 5));

      const after = getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(after.demoMediaExpanded).toBe(true);
      expect(getSignalEventsByType(db, 'demo_media_expanded')).toHaveLength(1);
    } finally {
      close();
    }
  });

  it('pinned note creation and edit are both logged, distinctly', () => {
    const { db, close } = createTestDb();
    try {
      const exerciseId = library.exercises[0].id;
      setPinnedNote(
        db,
        exerciseId,
        'row to the hips, not the chest',
        '2026-03-01T08:00:00.000Z',
        '2026-03-01',
      );
      setPinnedNote(
        db,
        exerciseId,
        'row to the hips — left shoulder warm up first',
        '2026-03-02T08:00:00.000Z',
        '2026-03-02',
      );

      expect(getSignalEventsByType(db, 'pinned_note_created')).toHaveLength(1);
      expect(getSignalEventsByType(db, 'pinned_note_edited')).toHaveLength(1);
    } finally {
      close();
    }
  });

  it('session abandonment records the exact exercise and set it was left at', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      startSession(db, sessionId, utcInstantFor('2026-03-01', 9));
      const entry = getPendingSession(db)!.entries.find((e) => e.section === 'main')!;
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: 0,
          status: 'completed',
          restPrescribedSec: entry.restSec,
        },
        utcInstantFor('2026-03-01', 9, 2),
      );
      // Abandoned partway through set 1.
      discardSession(
        db,
        sessionId,
        { abandonedEntryId: entry.id, abandonedSetIndex: 1 },
        utcInstantFor('2026-03-01', 9, 5),
      );

      const session = getSession(db, sessionId)!;
      expect(session.status).toBe('discarded');
      expect(session.abandonedEntryId).toBe(entry.id);
      expect(session.abandonedSetIndex).toBe(1);
      expect(getSignalEventsByType(db, 'abandoned')).toHaveLength(1);
    } finally {
      close();
    }
  });
});

describe('§8.1 recordEntryFeedback — three-state omit/set/clear (found via app/WorkoutScreen.rest.test.tsx)', () => {
  it('an explicit null clears a previously-set value; omitting the key leaves it untouched', () => {
    const { db, close } = createTestDb();
    try {
      const sessionId = makeSession(db);
      const entryId = getPendingSession(db)!.entries.find((e) => e.section === 'main')!.id;

      recordEntryFeedback(
        db,
        entryId,
        { difficulty: 'too_easy', enjoyment: 4 },
        utcInstantFor('2026-03-01'),
      );
      let entry = getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!;
      expect(entry.difficultyFeedback).toBe('too_easy');
      expect(entry.enjoymentFeedback).toBe(4);

      // Omitting `enjoyment` entirely must not touch it while clearing `difficulty`.
      recordEntryFeedback(db, entryId, { difficulty: null }, utcInstantFor('2026-03-01'));
      entry = getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!;
      expect(entry.difficultyFeedback).toBeNull(); // "tap the same value again clears it"
      expect(entry.enjoymentFeedback).toBe(4); // untouched

      recordEntryFeedback(db, entryId, { enjoyment: null }, utcInstantFor('2026-03-01'));
      entry = getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!;
      expect(entry.enjoymentFeedback).toBeNull();
    } finally {
      close();
    }
  });
});

describe('§8.3/§9.3 context signals — device timezone change, travel days, days since last session', () => {
  it('a device tz change is logged as a signal event only once the tz actually differs', () => {
    const { db, close } = createTestDb();
    try {
      observeTzId(db, 'America/New_York', utcInstantFor('2026-03-01'), '2026-03-01');
      expect(getSignalEventsByType(db, 'tz_change')).toHaveLength(0); // first-ever observation, not a change

      observeTzId(db, 'America/New_York', utcInstantFor('2026-03-02'), '2026-03-02');
      expect(getSignalEventsByType(db, 'tz_change')).toHaveLength(0); // unchanged

      observeTzId(db, 'Pacific/Auckland', utcInstantFor('2026-03-05'), '2026-03-05');
      const events = getSignalEventsByType(db, 'tz_change');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ from: 'America/New_York', to: 'Pacific/Auckland' });
    } finally {
      close();
    }
  });

  it('a travel day reduces the effective weekly denominator with a floor of 2', () => {
    const { db, close } = createTestDb();
    try {
      recordTravelDay(db, utcInstantFor('2026-03-01'));
      recordTravelDay(db, utcInstantFor('2026-03-02'));
      const stats = getStats(db)!;
      expect(stats.travelDaysThisWeek).toBe(2);

      expect(effectiveWeeklyDenominator(3, 2)).toBe(2); // 3-2=1, floored to 2
      expect(effectiveWeeklyDenominator(3, 0)).toBe(3);
    } finally {
      close();
    }
  });
});
