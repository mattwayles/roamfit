import { dateToTime, timeToDate } from './motivationNotifications';

describe('timeToDate / dateToTime — the Settings time picker round trip', () => {
  it('turns a "HH:MM" string into a local Date at that time and back', () => {
    const d = timeToDate('18:05');
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(5);
    expect(dateToTime(d)).toBe('18:05');
  });

  it('keeps midnight and the last minute of the day', () => {
    expect(dateToTime(timeToDate('00:00'))).toBe('00:00');
    expect(dateToTime(timeToDate('23:59'))).toBe('23:59');
  });

  it('falls back to 18:00 for a malformed string', () => {
    expect(dateToTime(timeToDate('nope'))).toBe('18:00');
  });
});
