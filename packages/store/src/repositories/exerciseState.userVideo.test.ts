/**
 * §11.4 / ADR 0009 — the user's own assigned demo video, per exercise.
 *
 * The persistence half of "assign a video from the workout screen, and have it come back the next
 * time this exercise appears." The retrieval-after-reopen case below is the one that actually
 * proves the feature: it asserts against a *freshly opened* handle to the same database file, so
 * an assignment that only ever lived in memory would fail it.
 */
import { createFileTestDb, createTestDb } from '../testHarness';
import {
  assignUserVideo,
  clearUserVideo,
  getUserVideoId,
  getVideoFlagState,
  reportVideoIssue,
} from './exerciseState';
import { getSignalEventsByType } from './signals';

const NOW = '2026-09-01T10:00:00.000Z';
const LOCAL_DATE = '2026-09-01';
const EXERCISE_ID = 'band-row-anchor-mid';
const OTHER_EXERCISE_ID = 'banded-push-up';
const VIDEO_ID = 'dQw4w9WgXcQ';

describe('user-assigned demo video', () => {
  it('an exercise with no assignment reads back null, without creating a row', () => {
    const { db } = createTestDb();
    expect(getUserVideoId(db, EXERCISE_ID)).toBeNull();
  });

  it('assigns and reads back the id', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    expect(getUserVideoId(db, EXERCISE_ID)).toBe(VIDEO_ID);
  });

  it('is scoped to one exercise — assigning does not leak onto another', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    expect(getUserVideoId(db, OTHER_EXERCISE_ID)).toBeNull();
  });

  it('replacing an assignment overwrites rather than accumulating', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    assignUserVideo(db, EXERCISE_ID, 'NEWvideo123', '2026-09-01T11:00:00.000Z', LOCAL_DATE);
    expect(getUserVideoId(db, EXERCISE_ID)).toBe('NEWvideo123');
  });

  it('clearing removes it and falls back to null', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    clearUserVideo(db, EXERCISE_ID, '2026-09-01T12:00:00.000Z');
    expect(getUserVideoId(db, EXERCISE_ID)).toBeNull();
  });

  it('clearing an exercise that never had one is a no-op, not an error', () => {
    const { db } = createTestDb();
    expect(() => clearUserVideo(db, EXERCISE_ID, NOW)).not.toThrow();
    expect(getUserVideoId(db, EXERCISE_ID)).toBeNull();
  });

  it('survives closing and reopening the database — this is the "next time" requirement', () => {
    // Deliberately a real on-disk database, not the `:memory:` default: closing an in-memory
    // handle discards it, so only this harness can actually prove durability across a
    // force-quit / cold launch (see testHarness.ts and issue #10).
    const file = createFileTestDb();
    assignUserVideo(file.db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    file.close();

    const reopened = file.reopen();
    try {
      expect(getUserVideoId(reopened.db, EXERCISE_ID)).toBe(VIDEO_ID);
    } finally {
      reopened.close();
    }
  });

  it('assigning clears a previous demotion — that verdict was about the old video', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    expect(getVideoFlagState(db, EXERCISE_ID).demoted).toBe(true);

    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);

    // Without this, the user's deliberate new pick would be suppressed by a flag count earned by
    // a different video, with nothing on screen explaining why.
    const after = getVideoFlagState(db, EXERCISE_ID);
    expect(after.demoted).toBe(false);
    expect(after.flagCount).toBe(0);
  });

  it('logs a user_video_assigned signal with the exercise and video', () => {
    const { db } = createTestDb();
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    const events = getSignalEventsByType(db, 'user_video_assigned');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      exerciseId: EXERCISE_ID,
      videoId: VIDEO_ID,
    });
  });

  it('does not disturb other per-exercise state on the same row', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, OTHER_EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    assignUserVideo(db, EXERCISE_ID, VIDEO_ID, NOW, LOCAL_DATE);
    expect(getVideoFlagState(db, OTHER_EXERCISE_ID).flagCount).toBe(1);
  });
});
