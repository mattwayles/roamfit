/**
 * §11.4 link health — "Two reports demote the exercise to tier 2 automatically." Local half of
 * the rule (see the schema.ts/exerciseState.ts comments for why it's local-only in v1).
 */
import { createTestDb } from '../testHarness';
import { getVideoFlagState, reportVideoIssue } from './exerciseState';
import { getSignalEventsByType } from './signals';

const NOW = '2026-08-31T10:00:00.000Z';
const LOCAL_DATE = '2026-08-31';
const EXERCISE_ID = 'band-row-anchor-mid';

describe('video flag / demotion', () => {
  it('a never-flagged exercise is not demoted', () => {
    const { db } = createTestDb();
    expect(getVideoFlagState(db, EXERCISE_ID)).toEqual({
      flagCount: 0,
      demoted: false,
      demotedAt: null,
    });
  });

  it('one report is not enough to demote', () => {
    const { db } = createTestDb();
    const after = reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    expect(after.flagCount).toBe(1);
    expect(after.demoted).toBe(false);
    expect(getVideoFlagState(db, EXERCISE_ID).demoted).toBe(false);
  });

  it('two reports demote the exercise, and demotedAt is stamped', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    const after = reportVideoIssue(
      db,
      EXERCISE_ID,
      'user_report',
      '2026-08-31T11:00:00.000Z',
      LOCAL_DATE,
    );
    expect(after.flagCount).toBe(2);
    expect(after.demoted).toBe(true);
    expect(after.demotedAt).toBe('2026-08-31T11:00:00.000Z');
    expect(getVideoFlagState(db, EXERCISE_ID)).toEqual({
      flagCount: 2,
      demoted: true,
      demotedAt: '2026-08-31T11:00:00.000Z',
    });
  });

  it('an automatic player-error flag counts toward the same threshold as a user report', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'player_error', NOW, LOCAL_DATE);
    const after = reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    expect(after.demoted).toBe(true);
  });

  it('demotedAt never moves once set, even as further reports keep incrementing the count', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    reportVideoIssue(db, EXERCISE_ID, 'user_report', '2026-08-31T11:00:00.000Z', LOCAL_DATE);
    const third = reportVideoIssue(
      db,
      EXERCISE_ID,
      'user_report',
      '2026-08-31T12:00:00.000Z',
      LOCAL_DATE,
    );
    expect(third.flagCount).toBe(3);
    expect(third.demotedAt).toBe('2026-08-31T11:00:00.000Z');
  });

  it('logs a video_flag_reported signal event on every report', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    reportVideoIssue(db, EXERCISE_ID, 'player_error', NOW, LOCAL_DATE);
    const events = getSignalEventsByType(db, 'video_flag_reported');
    expect(events).toHaveLength(2);
    expect(events[0].payload.source).toBe('user_report');
    expect(events[1].payload.source).toBe('player_error');
  });

  it('flag state is per-exercise — flagging one exercise never demotes another', () => {
    const { db } = createTestDb();
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    reportVideoIssue(db, EXERCISE_ID, 'user_report', NOW, LOCAL_DATE);
    expect(getVideoFlagState(db, EXERCISE_ID).demoted).toBe(true);
    expect(getVideoFlagState(db, 'some-other-exercise').demoted).toBe(false);
  });
});
