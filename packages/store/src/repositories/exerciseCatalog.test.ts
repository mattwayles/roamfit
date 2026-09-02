/**
 * The Exercises page's two reads. The cases that matter are the ones where "what the library says"
 * and "what actually happened" disagree: an exercise swapped in mid-workout, a session that was
 * discarded rather than completed, a set skipped rather than performed, and a band the user
 * corrected on the fly.
 */
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { assignUserVideo } from './exerciseState';
import { applyRemoteVideoConfig } from './remoteConfig';
import { recordExercisePerformed } from './exerciseState';
import {
  emptyCatalogState,
  getExerciseCatalogState,
  getExercisePerformanceHistory,
} from './exerciseCatalog';
import type { Db } from '../db';

const NOW = '2026-09-01T10:00:00.000Z';
const EXERCISE_ID = 'banded-push-up';
const OTHER_EXERCISE_ID = 'band-row-anchor-mid';

// ------------------------------------------------------------------------------------------
// Minimal session/entry/set-log fixtures. Deliberately hand-built rather than generated: these
// tests are about how the reads fold rows, so the rows need to be stated outright.
// ------------------------------------------------------------------------------------------

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function insertSession(
  db: Db,
  opts: { localDate: string; status: 'completed' | 'discarded' | 'active'; createdAt?: string },
): string {
  const sessionId = id('session');
  db.insert(schema.sessions)
    .values({
      id: sessionId,
      userId: 'local',
      status: opts.status,
      pendingSlot: opts.status === 'active' ? 1 : null,
      utcInstant: `${opts.localDate}T08:00:00.000Z`,
      localDate: opts.localDate,
      tzId: 'America/New_York',
      focus: 'upper',
      effort: 'normal',
      targetMinutes: 30,
      estimatedMinutes: 30,
      anchorsSnapshot: '[]',
      explanation: 'test',
      engineVersion: 'test',
      createdAt: opts.createdAt ?? `${opts.localDate}T08:00:00.000Z`,
      updatedAt: `${opts.localDate}T08:00:00.000Z`,
    })
    .run();
  return sessionId;
}

function insertEntry(
  db: Db,
  sessionId: string,
  opts: {
    exerciseId: string;
    plannedExerciseId?: string;
    band?: string | null;
    restSec?: number;
    tempoSec?: number;
    entryStatus?: 'planned' | 'removed_at_approval' | 'unplanned_added';
  },
): string {
  const entryId = id('entry');
  db.insert(schema.sessionEntries)
    .values({
      id: entryId,
      sessionId,
      section: 'main',
      orderIndex: 0,
      plannedExerciseId: opts.plannedExerciseId ?? opts.exerciseId,
      exerciseId: opts.exerciseId,
      role: 'main',
      band: opts.band ?? null,
      sets: 3,
      repTarget: 10,
      restSec: opts.restSec ?? 60,
      tempoSec: opts.tempoSec ?? 3,
      effort: 'normal',
      pattern: 'horizontal_push',
      anchorClass: 'none',
      estimatedSec: 200,
      entryStatus: opts.entryStatus ?? 'planned',
    })
    .run();
  return entryId;
}

function insertSet(
  db: Db,
  entryId: string,
  opts: {
    setIndex: number;
    status?: 'completed' | 'skipped';
    reps?: number;
    seconds?: number;
    bandActual?: string | null;
  },
): void {
  db.insert(schema.setLogs)
    .values({
      id: id('set'),
      entryId,
      setIndex: opts.setIndex,
      status: opts.status ?? 'completed',
      repsActual: opts.reps ?? null,
      secondsActual: opts.seconds ?? null,
      bandActual: opts.bandActual ?? null,
      restPrescribedSec: 60,
      createdAt: NOW,
    })
    .run();
}

// ------------------------------------------------------------------------------------------

describe('getExerciseCatalogState', () => {
  it('is empty on a fresh install, and every exercise falls back to the empty state', () => {
    const { db } = createTestDb();
    expect(getExerciseCatalogState(db)).toEqual({});
    expect(emptyCatalogState()).toEqual({
      timesCompleted: 0,
      lastPerformedAt: null,
      userVideoId: null,
      curatedVideoId: null,
      hasVideo: false,
    });
  });

  it('reports times completed and last performed from the exercise-state counter', () => {
    const { db } = createTestDb();
    recordExercisePerformed(db, EXERCISE_ID, { localDate: '2026-08-01' }, NOW);
    recordExercisePerformed(db, EXERCISE_ID, { localDate: '2026-08-05' }, NOW);

    const state = getExerciseCatalogState(db)[EXERCISE_ID];
    expect(state.timesCompleted).toBe(2);
    expect(state.lastPerformedAt).toBe('2026-08-05');
  });

  it('counts a user-assigned video as having a video', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, 'dQw4w9WgXcQ', NOW, '2026-09-01');

    const state = getExerciseCatalogState(db)[EXERCISE_ID];
    expect(state.userVideoId).toBe('dQw4w9WgXcQ');
    expect(state.hasVideo).toBe(true);
  });

  it('counts a curated remote-config video as having a video too — it needs no link pasted', () => {
    const { db } = createTestDb();
    applyRemoteVideoConfig(db, {
      exerciseId: EXERCISE_ID,
      videoId: 'curated123',
      videoVerifiedAt: NOW,
      videoFlagCount: 0,
      updatedAt: NOW,
    });

    const state = getExerciseCatalogState(db)[EXERCISE_ID];
    expect(state.curatedVideoId).toBe('curated123');
    expect(state.hasVideo).toBe(true);
  });

  it('a remote-config row with a null id is still "needs a video"', () => {
    const { db } = createTestDb();
    applyRemoteVideoConfig(db, {
      exerciseId: EXERCISE_ID,
      videoId: null,
      videoVerifiedAt: null,
      videoFlagCount: 0,
      updatedAt: NOW,
    });
    expect(getExerciseCatalogState(db)[EXERCISE_ID].hasVideo).toBe(false);
  });

  it('keeps the performed counter when a curated row lands for the same exercise', () => {
    const { db } = createTestDb();
    recordExercisePerformed(db, EXERCISE_ID, { localDate: '2026-08-01' }, NOW);
    applyRemoteVideoConfig(db, {
      exerciseId: EXERCISE_ID,
      videoId: 'curated123',
      videoVerifiedAt: NOW,
      videoFlagCount: 0,
      updatedAt: NOW,
    });

    const state = getExerciseCatalogState(db)[EXERCISE_ID];
    expect(state.timesCompleted).toBe(1);
    expect(state.hasVideo).toBe(true);
  });
});

describe('getExercisePerformanceHistory', () => {
  it('is empty for an exercise that has never run', () => {
    const { db } = createTestDb();
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([]);
  });

  it('folds a session into one point: sets completed, best set, total volume, band', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID, band: 'B2' });
    insertSet(db, entryId, { setIndex: 0, reps: 10 });
    insertSet(db, entryId, { setIndex: 1, reps: 12 });
    insertSet(db, entryId, { setIndex: 2, reps: 8 });

    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([
      {
        sessionId,
        localDate: '2026-08-01',
        setsCompleted: 3,
        bestReps: 12,
        bestSeconds: null,
        totalReps: 30,
        totalSeconds: 0,
        band: 'B2',
        restSec: 60,
        tempoSec: 3,
      },
    ]);
  });

  it('orders oldest first — the direction a progression chart reads', () => {
    const { db } = createTestDb();
    for (const date of ['2026-08-10', '2026-08-01', '2026-08-05']) {
      const sessionId = insertSession(db, { localDate: date, status: 'completed' });
      const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID });
      insertSet(db, entryId, { setIndex: 0, reps: 10 });
    }
    expect(getExercisePerformanceHistory(db, EXERCISE_ID).map((p) => p.localDate)).toEqual([
      '2026-08-01',
      '2026-08-05',
      '2026-08-10',
    ]);
  });

  it('ignores sessions that were never completed — discarded history is not tracked history', () => {
    const { db } = createTestDb();
    for (const status of ['discarded', 'active'] as const) {
      const sessionId = insertSession(db, { localDate: '2026-08-01', status });
      const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID });
      insertSet(db, entryId, { setIndex: 0, reps: 10 });
    }
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([]);
  });

  it('drops a session where every set was skipped rather than plotting it as a zero', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID });
    insertSet(db, entryId, { setIndex: 0, status: 'skipped' });
    insertSet(db, entryId, { setIndex: 1, status: 'skipped' });
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([]);
  });

  it('ignores an entry removed at approval — it never ran', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, {
      exerciseId: EXERCISE_ID,
      entryStatus: 'removed_at_approval',
    });
    insertSet(db, entryId, { setIndex: 0, reps: 10 });
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([]);
  });

  it('follows what actually ran, not what was planned — a swap counts for the exercise performed', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, {
      exerciseId: EXERCISE_ID,
      plannedExerciseId: OTHER_EXERCISE_ID,
    });
    insertSet(db, entryId, { setIndex: 0, reps: 10 });

    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toHaveLength(1);
    expect(getExercisePerformanceHistory(db, OTHER_EXERCISE_ID)).toEqual([]);
  });

  it('takes the band the user says they actually used over the one prescribed', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID, band: 'B2' });
    insertSet(db, entryId, { setIndex: 0, reps: 10, bandActual: 'B4' });
    insertSet(db, entryId, { setIndex: 1, reps: 10 });

    // Heaviest across the session's completed sets, so a single heavier set is not averaged away.
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)[0].band).toBe('B4');
  });

  it('records timed work in seconds, leaving reps null', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID });
    insertSet(db, entryId, { setIndex: 0, seconds: 40 });
    insertSet(db, entryId, { setIndex: 1, seconds: 55 });

    const point = getExercisePerformanceHistory(db, EXERCISE_ID)[0];
    expect(point.bestSeconds).toBe(55);
    expect(point.totalSeconds).toBe(95);
    expect(point.bestReps).toBeNull();
  });

  it('merges two entries for the same exercise in one session into a single point', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const first = insertEntry(db, sessionId, { exerciseId: EXERCISE_ID });
    const second = insertEntry(db, sessionId, {
      exerciseId: EXERCISE_ID,
      entryStatus: 'unplanned_added',
    });
    insertSet(db, first, { setIndex: 0, reps: 10 });
    insertSet(db, second, { setIndex: 0, reps: 14 });

    const points = getExercisePerformanceHistory(db, EXERCISE_ID);
    expect(points).toHaveLength(1);
    expect(points[0].setsCompleted).toBe(2);
    expect(points[0].bestReps).toBe(14);
    expect(points[0].totalReps).toBe(24);
  });

  it('is scoped to the exercise asked for', () => {
    const { db } = createTestDb();
    const sessionId = insertSession(db, { localDate: '2026-08-01', status: 'completed' });
    const entryId = insertEntry(db, sessionId, { exerciseId: OTHER_EXERCISE_ID });
    insertSet(db, entryId, { setIndex: 0, reps: 10 });
    expect(getExercisePerformanceHistory(db, EXERCISE_ID)).toEqual([]);
  });
});
