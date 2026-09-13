/**
 * Pure-function tests for Quick Session's focus/difficulty picks — see `quickSession.ts`'s header
 * for why this lives outside both `HomeScreen.tsx` and the engine.
 */
import type { SessionHistoryRecord } from '@roamfit/engine';
import { pickQuickSessionDifficulty, pickQuickSessionFocus } from './quickSession';

function record(overrides: Partial<SessionHistoryRecord>): SessionHistoryRecord {
  return {
    localDate: '2026-08-01',
    focus: 'full',
    difficulty: 'medium',
    status: 'completed',
    entries: [],
    ...overrides,
  };
}

describe('pickQuickSessionFocus', () => {
  it('defaults to full with no history', () => {
    expect(pickQuickSessionFocus([])).toBe('full');
  });

  it('picks the least-represented focus', () => {
    const history = [
      record({ focus: 'full' }),
      record({ focus: 'full' }),
      record({ focus: 'upper' }),
      record({ focus: 'legs' }),
    ];
    // 'abs' has never been trained — 0 sessions, strictly least.
    expect(pickQuickSessionFocus(history)).toBe('abs');
  });

  it('breaks a tied lowest count by whichever was trained longest ago', () => {
    const history = [
      record({ focus: 'upper', localDate: '2026-08-01' }), // oldest untouched-since
      record({ focus: 'full', localDate: '2026-08-02' }),
      record({ focus: 'legs', localDate: '2026-08-03' }),
      record({ focus: 'abs', localDate: '2026-08-04' }),
    ];
    // Every focus trained exactly once; 'upper' is the oldest, so it's next up.
    expect(pickQuickSessionFocus(history)).toBe('upper');
  });

  it('counts discarded and partial sessions as recent interest, not just completed ones', () => {
    const history = [
      record({ focus: 'full', status: 'discarded' }),
      record({ focus: 'full', status: 'partial' }),
      record({ focus: 'upper', status: 'completed' }),
      record({ focus: 'legs', status: 'completed' }),
    ];
    expect(pickQuickSessionFocus(history)).toBe('abs');
  });
});

describe('pickQuickSessionDifficulty', () => {
  it('defaults to medium with no history at this focus', () => {
    const history = [record({ focus: 'upper', difficulty: 'hard', status: 'completed' })];
    expect(pickQuickSessionDifficulty(history, 'abs')).toBe('medium');
  });

  it('matches the difficulty of the most recent completed session at this focus', () => {
    const history = [
      record({ focus: 'abs', difficulty: 'easy', status: 'completed', localDate: '2026-08-01' }),
      record({ focus: 'abs', difficulty: 'hard', status: 'completed', localDate: '2026-08-10' }),
    ];
    expect(pickQuickSessionDifficulty(history, 'abs')).toBe('hard');
  });

  it('skips a non-completed session at this focus and falls back to the last completed one', () => {
    const history = [
      record({ focus: 'abs', difficulty: 'hard', status: 'completed', localDate: '2026-08-01' }),
      record({ focus: 'abs', difficulty: 'easy', status: 'discarded', localDate: '2026-08-10' }),
    ];
    expect(pickQuickSessionDifficulty(history, 'abs')).toBe('hard');
  });

  it('defaults to medium when every session at this focus is non-completed', () => {
    const history = [record({ focus: 'abs', difficulty: 'hard', status: 'partial' })];
    expect(pickQuickSessionDifficulty(history, 'abs')).toBe('medium');
  });
});
