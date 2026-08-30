import { localDateForInstant, isWithinRollingWindow, daysBetween } from './dates';

describe('localDateForInstant', () => {
  it('derives local_date from the real tz_id, not a UTC slice (done-criterion: flying east does not lose or duplicate a day)', () => {
    // A single UTC instant near midnight: naive `toISOString().slice(0,10)` UTC-slicing would
    // return 2026-03-01 for BOTH zones below, silently wrong for the second. The whole point of
    // storing tz_id per session is that the *actual* local calendar date differs.
    const utcInstant = '2026-03-01T23:30:00.000Z';
    expect(localDateForInstant(utcInstant, 'America/New_York')).toBe('2026-03-01');
    expect(localDateForInstant(utcInstant, 'Pacific/Auckland')).toBe('2026-03-02');
  });

  it('a user flying west (Auckland -> Honolulu) trains twice ~20h apart in wall-clock time and neither loses nor duplicates a day', () => {
    // Session 1: trains in Auckland (UTC+13 in Jan) at local 08:00 on Jan 15.
    const s1Utc = '2026-01-14T19:00:00.000Z'; // 08:00 NZDT on Jan 15
    const s1Local = localDateForInstant(s1Utc, 'Pacific/Auckland');
    expect(s1Local).toBe('2026-01-15');

    // ~20 real hours later, now in Honolulu (UTC-10), trains again at local 09:00.
    const s2Utc = '2026-01-15T19:00:00.000Z'; // 09:00 HST on Jan 15 (Honolulu)
    const s2Local = localDateForInstant(s2Utc, 'Pacific/Honolulu');
    expect(s2Local).toBe('2026-01-15');

    // Both sessions land on the *same* local calendar day in their respective zones — correct,
    // since crossing the date line westbound recovers the day a naive UTC-only scheme would
    // have advanced past. daysBetween must agree: zero days elapsed between the two local dates.
    expect(daysBetween(s1Local, s2Local)).toBe(0);
  });

  it('a user flying east loses real wall-clock time but local_date still advances by exactly the calendar days that actually passed', () => {
    // Trains in Honolulu (UTC-10) at 22:00 local on Jan 15.
    const s1Utc = '2026-01-16T08:00:00.000Z';
    const s1Local = localDateForInstant(s1Utc, 'Pacific/Honolulu');
    expect(s1Local).toBe('2026-01-15');

    // Flies east to Auckland (UTC+13); by the time they land and train it's 06:00 local on
    // Jan 17 Auckland time (a long-haul-plus-layover style gap).
    const s2Utc = '2026-01-16T17:00:00.000Z';
    const s2Local = localDateForInstant(s2Utc, 'Pacific/Auckland');
    expect(s2Local).toBe('2026-01-17');

    expect(daysBetween(s1Local, s2Local)).toBe(2);
  });
});

describe('isWithinRollingWindow', () => {
  it('includes today and excludes anything windowDays or more in the past', () => {
    expect(isWithinRollingWindow('2026-01-15', '2026-01-15', 7)).toBe(true);
    expect(isWithinRollingWindow('2026-01-09', '2026-01-15', 7)).toBe(true); // 6 days ago
    expect(isWithinRollingWindow('2026-01-08', '2026-01-15', 7)).toBe(false); // 7 days ago
  });

  it('excludes future dates', () => {
    expect(isWithinRollingWindow('2026-01-16', '2026-01-15', 7)).toBe(false);
  });
});
