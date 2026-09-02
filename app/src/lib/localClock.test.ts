/**
 * Invariant 6 — all calendar math uses `local_date`, never UTC.
 *
 * This exists because the invariant was actually broken in `WorkoutScreen.tsx`: three signal
 * handlers derived their `local_date` as `nowUtcInstant().slice(0, 10)`, which is the *UTC* date.
 * For an evening workout anywhere west of UTC that stamps tomorrow's date on today's signal, and
 * every §12 calendar view (the heatmap, the weekly count, the "sessions this week" math) reads
 * those dates. The bug is invisible in a UTC test environment, which is exactly why it survived.
 */
import { localDateFromDate, nowEngineClock, nowUtcInstant } from './localClock';

describe('localDateFromDate', () => {
  it('uses the local wall-clock date, not the UTC one', () => {
    // Constructed from local components, so this is 23:30 local time in whatever zone the test
    // runs in. The local date is 2026-09-01 by construction, in every zone.
    const lateEvening = new Date(2026, 8, 1, 23, 30, 0);
    expect(localDateFromDate(lateEvening)).toBe('2026-09-01');
  });

  it('uses the local date for an early-morning instant too', () => {
    const earlyMorning = new Date(2026, 8, 1, 0, 15, 0);
    expect(localDateFromDate(earlyMorning)).toBe('2026-09-01');
  });

  it('zero-pads month and day', () => {
    expect(localDateFromDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('handles a leap day', () => {
    expect(localDateFromDate(new Date(2028, 1, 29, 12, 0, 0))).toBe('2028-02-29');
  });

  it('diverges from a naive UTC slice when the device is not on UTC', () => {
    // The actual regression guard. In a UTC environment the two agree and there is nothing to
    // prove, so assert the divergence only where it is real — otherwise this test would have to
    // be deleted on a UTC CI box, taking the protection with it.
    const lateEvening = new Date(2026, 8, 1, 23, 30, 0);
    const naiveUtcSlice = lateEvening.toISOString().slice(0, 10);
    if (lateEvening.getTimezoneOffset() > 0) {
      // Device is behind UTC (the Americas): 23:30 local is already tomorrow in UTC.
      expect(naiveUtcSlice).toBe('2026-09-02');
      expect(localDateFromDate(lateEvening)).not.toBe(naiveUtcSlice);
    }
    // Whatever the zone, the local answer is the one invariant 6 asks for.
    expect(localDateFromDate(lateEvening)).toBe('2026-09-01');
  });
});

describe('nowEngineClock', () => {
  it('reports today as a local date, matching localDateFromDate', () => {
    expect(nowEngineClock().today).toBe(localDateFromDate(new Date()));
  });

  it('carries a tz id', () => {
    expect(typeof nowEngineClock().tzId).toBe('string');
    expect(nowEngineClock().tzId.length).toBeGreaterThan(0);
  });
});

describe('nowUtcInstant', () => {
  it('is a UTC ISO instant — the persistence timestamp, never the calendar date', () => {
    expect(nowUtcInstant()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
