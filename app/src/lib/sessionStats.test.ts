/**
 * Pure-function tests for the completion screen's stat grid — no db, no RN rendering. Builds
 * `SessionRecord`/`SessionEntryRecord`/`SetLogRecord` shapes directly (same style as
 * `dashboard.test.ts`) rather than driving a real `generate()`/`completeSession()` — this module
 * only folds over the shape, so a hand-built fixture is a faithful, much cheaper test of it.
 */
import { buildSessionCompletionStats } from './sessionStats';
import type { sessionsRepo } from '@roamfit/store';

type SessionRecord = sessionsRepo.SessionRecord;
type SessionEntryRecord = sessionsRepo.SessionEntryRecord;
type SetLogRecord = sessionsRepo.SetLogRecord;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeSetLog(overrides: Partial<SetLogRecord> = {}): SetLogRecord {
  return {
    id: nextId('log'),
    entryId: 'entry-1',
    setIndex: 0,
    status: 'completed',
    repsPrescribed: null,
    secondsPrescribed: null,
    repsActual: null,
    secondsActual: null,
    bandActual: null,
    startedAt: null,
    completedAt: null,
    restPrescribedSec: 60,
    restTakenSec: null,
    restExtendedCount: 0,
    pauseCount: 0,
    pausedDurationSec: 0,
    difficultyFeedback: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<SessionEntryRecord> = {}): SessionEntryRecord {
  return {
    id: nextId('entry'),
    sessionId: 'session-1',
    section: 'main',
    orderIndex: 0,
    plannedExerciseId: 'push-up',
    exerciseId: 'push-up',
    role: 'main',
    group: null,
    band: null,
    sets: 3,
    repTarget: 10,
    durationSec: null,
    restSec: 60,
    tempoSec: 2,
    notes: null,
    difficulty: 'medium',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: 'horizontal_push',
    anchorClass: 'bodyweight',
    unilateral: false,
    estimatedSec: 180,
    substitutedFor: null,
    unplanned: false,
    entryStatus: 'planned',
    difficultyFeedback: null,
    demoMediaExpanded: false,
    setLogs: [],
    ...overrides,
  };
}

function makeSession(entries: SessionEntryRecord[]): SessionRecord {
  return {
    id: 'session-1',
    status: 'completed',
    utcInstant: '2026-09-13T12:00:00.000Z',
    localDate: '2026-09-13',
    tzId: 'America/Los_Angeles',
    focus: 'full',
    difficulty: 'medium',
    format: 'standard',
    targetMinutes: 30,
    estimatedMinutes: 30,
    actualMinutes: 28,
    anchorsSnapshot: [],
    explanation: '',
    patternGaps: [],
    timeBudgetDeviation: null,
    retrospective: null,
    city: null,
    country: null,
    generatedBy: 'engine',
    engineVersion: '1',
    comebackTier: 'none',
    recoveryWeekManual: false,
    abandonedEntryId: null,
    abandonedSetIndex: null,
    regenerateTapCount: 0,
    startedAt: '2026-09-13T11:30:00.000Z',
    pausedAt: null,
    pausedTotalSec: 0,
    cursorEntryId: null,
    cursorSetIndex: null,
    completedAt: '2026-09-13T12:00:00.000Z',
    discardedAt: null,
    entries,
  };
}

describe('buildSessionCompletionStats', () => {
  it('a session with nothing logged yields all-zero, not-null stats', () => {
    const session = makeSession([makeEntry({ setLogs: [] })]);
    expect(buildSessionCompletionStats(session)).toEqual({
      setsCompleted: 0,
      totalReps: 0,
      totalSeconds: 0,
      exercisesTrained: 0,
      heaviestBand: null,
    });
  });

  it('counts only completed sets — skipped and not-reached sets earn nothing', () => {
    const entry = makeEntry({
      setLogs: [
        makeSetLog({ setIndex: 0, status: 'completed', repsActual: 10 }),
        makeSetLog({ setIndex: 1, status: 'skipped' }),
        makeSetLog({ setIndex: 2, status: 'not_reached' }),
      ],
    });
    const stats = buildSessionCompletionStats(makeSession([entry]));
    expect(stats.setsCompleted).toBe(1);
    expect(stats.totalReps).toBe(10);
    expect(stats.exercisesTrained).toBe(1);
  });

  it('sums reps and seconds independently across mixed rep and timed entries', () => {
    const repsEntry = makeEntry({
      id: 'reps-entry',
      exerciseId: 'push-up',
      setLogs: [
        makeSetLog({ entryId: 'reps-entry', setIndex: 0, repsActual: 12 }),
        makeSetLog({ entryId: 'reps-entry', setIndex: 1, repsActual: 10 }),
      ],
    });
    const timedEntry = makeEntry({
      id: 'timed-entry',
      exerciseId: 'plank',
      setLogs: [
        makeSetLog({ entryId: 'timed-entry', setIndex: 0, secondsActual: 45 }),
        makeSetLog({ entryId: 'timed-entry', setIndex: 1, secondsActual: 30 }),
      ],
    });
    const stats = buildSessionCompletionStats(makeSession([repsEntry, timedEntry]));
    expect(stats.setsCompleted).toBe(4);
    expect(stats.totalReps).toBe(22);
    expect(stats.totalSeconds).toBe(75);
    expect(stats.exercisesTrained).toBe(2);
  });

  it('an entry with every set skipped does not count toward exercisesTrained', () => {
    const trained = makeEntry({
      id: 'trained',
      setLogs: [makeSetLog({ entryId: 'trained', repsActual: 8 })],
    });
    const allSkipped = makeEntry({
      id: 'all-skipped',
      setLogs: [
        makeSetLog({ entryId: 'all-skipped', setIndex: 0, status: 'skipped' }),
        makeSetLog({ entryId: 'all-skipped', setIndex: 1, status: 'skipped' }),
      ],
    });
    const stats = buildSessionCompletionStats(makeSession([trained, allSkipped]));
    expect(stats.exercisesTrained).toBe(1);
  });

  it('picks the heaviest band actually used, preferring bandActual over the entry default', () => {
    const entry = makeEntry({
      band: 'B2',
      setLogs: [
        makeSetLog({ setIndex: 0, bandActual: null }), // falls back to entry.band = B2
        makeSetLog({ setIndex: 1, bandActual: 'B4' }), // a logged correction, heavier
        makeSetLog({ setIndex: 2, bandActual: 'B1' }), // a lighter correction — doesn't win
      ],
    });
    const stats = buildSessionCompletionStats(makeSession([entry]));
    expect(stats.heaviestBand).toBe('B4');
  });

  it('bodyweight-only sessions (no band ever logged) report a null heaviest band, not B1', () => {
    const entry = makeEntry({
      band: null,
      anchorClass: 'bodyweight',
      setLogs: [makeSetLog({ repsActual: 15 })],
    });
    const stats = buildSessionCompletionStats(makeSession([entry]));
    expect(stats.heaviestBand).toBeNull();
  });

  it('an entry removed at approval is excluded entirely, even if it somehow has set logs', () => {
    const removed = makeEntry({
      entryStatus: 'removed_at_approval',
      setLogs: [makeSetLog({ repsActual: 99 })],
    });
    const stats = buildSessionCompletionStats(makeSession([removed]));
    expect(stats.setsCompleted).toBe(0);
    expect(stats.totalReps).toBe(0);
  });
});
