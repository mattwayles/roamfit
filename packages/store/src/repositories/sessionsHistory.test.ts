/**
 * The history reads behind the Logbook's day sheet, month paging and the workout history page:
 * range filtering on `local_date`, per-month counts, and the completed-only detail loader.
 */
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import type { Db } from '../db';
import {
  countCompletedSessionsByMonth,
  getCompletedSessionDetail,
  getCompletedSessionsForDashboard,
  getCompletedSessionsInRange,
} from './sessions';

let seq = 0;
function insertSession(
  db: Db,
  localDate: string,
  status: 'completed' | 'discarded' | 'active' = 'completed',
): string {
  seq += 1;
  const id = `hist-session-${seq}`;
  db.insert(schema.sessions)
    .values({
      id,
      userId: 'local',
      status,
      pendingSlot: status === 'active' ? 1 : null,
      utcInstant: `${localDate}T08:00:00.000Z`,
      localDate,
      tzId: 'America/New_York',
      focus: 'legs',
      difficulty: 'medium',
      targetMinutes: 30,
      estimatedMinutes: 30,
      anchorsSnapshot: '[]',
      explanation: 'test',
      engineVersion: 'test',
      createdAt: `${localDate}T08:00:00.000Z`,
      updatedAt: `${localDate}T08:00:00.000Z`,
    })
    .run();
  return id;
}

function insertEntry(db: Db, sessionId: string, status: 'planned' | 'removed_at_approval'): string {
  seq += 1;
  const id = `hist-entry-${seq}`;
  db.insert(schema.sessionEntries)
    .values({
      id,
      sessionId,
      section: 'main',
      orderIndex: 0,
      plannedExerciseId: 'banded-push-up',
      exerciseId: 'banded-push-up',
      role: 'main',
      sets: 3,
      repTarget: 10,
      restSec: 60,
      tempoSec: 3,
      difficulty: 'medium',
      pattern: 'horizontal_push',
      anchorClass: 'none',
      estimatedSec: 200,
      entryStatus: status,
    })
    .run();
  db.insert(schema.setLogs)
    .values({
      id: `${id}-set`,
      entryId: id,
      setIndex: 0,
      status: 'completed',
      repsActual: 10,
      restPrescribedSec: 60,
      createdAt: '2026-09-01T10:00:00.000Z',
    })
    .run();
  return id;
}

describe('getCompletedSessionsInRange', () => {
  it('includes both ends and nothing outside them, newest first, with ids', () => {
    const { db } = createTestDb();
    const before = insertSession(db, '2026-08-31');
    const first = insertSession(db, '2026-09-01');
    const mid = insertSession(db, '2026-09-15');
    const last = insertSession(db, '2026-09-30');
    const after = insertSession(db, '2026-10-01');

    const ids = getCompletedSessionsInRange(db, '2026-09-01', '2026-09-30').map((s) => s.id);
    expect(ids).toEqual([last, mid, first]);
    expect(ids).not.toContain(before);
    expect(ids).not.toContain(after);
  });

  it('excludes discarded and in-flight sessions', () => {
    const { db } = createTestDb();
    insertSession(db, '2026-09-02', 'discarded');
    insertSession(db, '2026-09-03', 'active');
    const kept = insertSession(db, '2026-09-04');
    expect(getCompletedSessionsInRange(db, '2026-09-01', '2026-09-30').map((s) => s.id)).toEqual([
      kept,
    ]);
  });

  it('is not capped like the dashboard read, so old months survive', () => {
    const { db } = createTestDb();
    insertSession(db, '2024-01-10');
    for (let d = 1; d <= 3; d++) insertSession(db, `2026-09-0${d}`);
    expect(getCompletedSessionsForDashboard(db, 3).map((s) => s.localDate)).not.toContain(
      '2024-01-10',
    );
    expect(getCompletedSessionsInRange(db, '2024-01-01', '2024-01-31')).toHaveLength(1);
  });

  it('keeps two sessions on one day', () => {
    const { db } = createTestDb();
    insertSession(db, '2026-09-10');
    insertSession(db, '2026-09-10');
    expect(getCompletedSessionsInRange(db, '2026-09-10', '2026-09-10')).toHaveLength(2);
  });
});

describe('countCompletedSessionsByMonth', () => {
  it('buckets by YYYY-MM of local_date, completed only, across a year boundary', () => {
    const { db } = createTestDb();
    insertSession(db, '2025-12-31');
    insertSession(db, '2026-01-01');
    insertSession(db, '2026-01-20');
    insertSession(db, '2026-01-21', 'discarded');
    insertSession(db, '2026-03-05', 'active');

    const counts = countCompletedSessionsByMonth(db);
    expect(Object.fromEntries(counts)).toEqual({ '2025-12': 1, '2026-01': 2 });
    expect([...counts.keys()].sort()[0]).toBe('2025-12');
  });

  it('is empty on a fresh install', () => {
    expect(countCompletedSessionsByMonth(createTestDb().db).size).toBe(0);
  });
});

describe('getCompletedSessionDetail', () => {
  it('returns the session with entries and set logs when completed', () => {
    const { db } = createTestDb();
    const id = insertSession(db, '2026-09-01');
    insertEntry(db, id, 'planned');
    const detail = getCompletedSessionDetail(db, id);
    expect(detail?.id).toBe(id);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0].setLogs[0].repsActual).toBe(10);
  });

  it('keeps removed_at_approval entries on the record so callers can drop them explicitly', () => {
    const { db } = createTestDb();
    const id = insertSession(db, '2026-09-01');
    insertEntry(db, id, 'planned');
    insertEntry(db, id, 'removed_at_approval');
    const entries = getCompletedSessionDetail(db, id)!.entries;
    expect(entries.map((e) => e.entryStatus).sort()).toEqual(['planned', 'removed_at_approval']);
  });

  it('is null for a discarded, active or unknown session', () => {
    const { db } = createTestDb();
    expect(getCompletedSessionDetail(db, insertSession(db, '2026-09-01', 'discarded'))).toBeNull();
    expect(getCompletedSessionDetail(db, insertSession(db, '2026-09-02', 'active'))).toBeNull();
    expect(getCompletedSessionDetail(db, 'nope')).toBeNull();
  });
});
