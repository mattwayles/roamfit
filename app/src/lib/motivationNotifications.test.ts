import {
  buildDailyNudgeText,
  buildWeeklySummaryText,
  clampToQuietHours,
  observedTrainingHour,
  sessionLocalHours,
} from './motivationNotifications';

describe("§9.8 sessionLocalHours — uses each session's own tzId, not the device's current one", () => {
  it('derives the local hour from a UTC instant + tzId', () => {
    // 2026-05-01T06:30:00Z is 18:30 in America/Los_Angeles the previous day, but the *hour*
    // (18) is what matters, not the date rollover.
    const hours = sessionLocalHours([{ startedAt: '2026-05-01T06:30:00.000Z', tzId: 'UTC' }]);
    expect(hours).toEqual([6]);
  });

  it('the same instant produces a different hour under a different tzId', () => {
    const utc = sessionLocalHours([{ startedAt: '2026-05-01T18:00:00.000Z', tzId: 'UTC' }]);
    const tokyo = sessionLocalHours([
      { startedAt: '2026-05-01T18:00:00.000Z', tzId: 'Asia/Tokyo' },
    ]);
    expect(utc[0]).not.toBe(tokyo[0]);
  });

  it('an unrecognized tzId is skipped rather than throwing', () => {
    expect(
      sessionLocalHours([{ startedAt: '2026-05-01T18:00:00.000Z', tzId: 'Not/A_Zone' }]),
    ).toEqual([]);
  });
});

describe('§9.8 observedTrainingHour — the mode, not the mean', () => {
  it('picks the most frequent hour', () => {
    expect(observedTrainingHour([7, 7, 7, 18, 20])).toBe(7);
  });

  it('returns null with no history — the caller falls back to a neutral default', () => {
    expect(observedTrainingHour([])).toBeNull();
  });
});

describe('§9.8 quiet hours — never dropped, moved to a gentle default instead', () => {
  it('leaves a daytime hour untouched', () => {
    expect(clampToQuietHours(18)).toBe(18);
  });

  it("moves a late-night hour to the quiet window's own end (7am), never silently drops it", () => {
    expect(clampToQuietHours(23)).toBe(7);
    expect(clampToQuietHours(3)).toBe(7);
  });

  it('the boundary hours themselves are handled consistently (start is quiet, end is not)', () => {
    expect(clampToQuietHours(22)).toBe(7);
    expect(clampToQuietHours(7)).toBe(7);
  });
});

describe('§9.8 copy — loss-aversion, never guilt', () => {
  it('prefers a concrete Next Unlock line when one exists', () => {
    const { body } = buildDailyNudgeText({
      familyName: 'horizontal_push',
      exerciseName: 'Push-ups',
      nextExerciseName: 'archer push-ups',
      sessionsRemaining: 2,
    });
    expect(body).toContain('2 sessions from archer push-ups');
    expect(body.toLowerCase()).not.toMatch(/missed|fail|broke|streak/);
  });

  it('falls back to a still-positive line with no board data', () => {
    const { body } = buildDailyNudgeText(null);
    expect(body.length).toBeGreaterThan(0);
    expect(body.toLowerCase()).not.toMatch(/missed|fail|broke/);
  });

  it('weekly summary reports the count without shaming a miss', () => {
    const { body } = buildWeeklySummaryText(
      {
        lifetimeSessionCount: 10,
        lifetimeTotalMinutes: 300,
        rolling7dLocalDates: [],
        weekStreak: 2,
        travelDaysThisWeek: 0,
        estimateAccuracyEma: null,
        lastSessionLocalDate: null,
        weeksSinceLastRecoveryWeek: 1,
      },
      1,
      3,
    );
    expect(body).toContain('1 of 3 sessions this week');
    expect(body).toContain('2 week streak');
    expect(body.toLowerCase()).not.toMatch(/missed|fail|behind/);
  });
});
