import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from './localClock';
import { buildPassportSummary } from './dashboard';
import { bookPageForLabel } from './passportBook';
import { formatStampDate, lookupNewStamp } from './newStamp';

/** A real, fully-logged, completed session on today's local date. */
function completeASession(seed: string): string {
  const db = getDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  usersRepo.ensureUser(db, utcInstant);
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, utcInstant);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString(seed)),
    utcInstant,
  });
  const sessionId = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, sessionId, utcInstant);
  for (const e of sessionsRepo.getSession(db, sessionId)!.entries) {
    if (e.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < e.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: e.id,
          setIndex: i,
          status: 'completed',
          repsActual: e.repTarget ?? undefined,
          secondsActual: e.durationSec ?? undefined,
          restPrescribedSec: e.restSec,
        },
        utcInstant,
      );
    }
  }
  completeSession(db, { sessionId, library: exerciseLibrary, families: familyLibrary }, utcInstant);
  return sessionId;
}

const BEND = { city: 'Bend', country: 'United States', region: 'OR', countryCode: 'US' };

describe('formatStampDate', () => {
  it('formats a local_date like a passport entry, with no timezone math', () => {
    expect(formatStampDate('2026-10-03')).toBe('OCT 3, 2026');
    expect(formatStampDate('2026-01-31')).toBe('JAN 31, 2026');
  });
  it('falls back to the raw string rather than inventing a date', () => {
    expect(formatStampDate('nonsense')).toBe('nonsense');
  });
});

describe('lookupNewStamp', () => {
  it('resolves null (never throws) when the drain fails', async () => {
    const db = {} as never;
    await expect(
      lookupNewStamp(db, 's1', 50, () => Promise.reject(new Error('offline'))),
    ).resolves.toBeNull();
  });

  it('gives up after the timeout when the drain hangs', async () => {
    const db = {} as never;
    const started = Date.now();
    await expect(lookupNewStamp(db, 's1', 40, () => new Promise(() => {}))).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('lookupNewStamp against the real store', () => {
  it('returns the stamp when the geocode lands a first-time place, with passport counts', async () => {
    const db = getDb();
    const id = completeASession('stamp-lookup-a');
    const stamp = await lookupNewStamp(db, id, 1000, async () =>
      sessionsRepo.applyGeocodeResult(db, id, BEND, nowUtcInstant()),
    );
    expect(stamp).toMatchObject({
      label: 'Bend, OR, USA',
      placeCount: 1,
      countryCount: 1,
      newCountry: true,
    });
    expect(stamp?.dateLabel).toMatch(/^[A-Z]{3} \d{1,2}, \d{4}$/);
  });

  it('carries the exact label the Passport book files the place under (the deep link finds it)', async () => {
    const db = getDb();
    const id = completeASession('stamp-lookup-label');
    const place = { city: 'Lisbon', country: 'Portugal', region: null, countryCode: 'PT' };
    const stamp = await lookupNewStamp(db, id, 1000, async () =>
      sessionsRepo.applyGeocodeResult(db, id, place, nowUtcInstant()),
    );
    expect(stamp?.label).toBe('Lisbon, PRT');
    const summary = buildPassportSummary(sessionsRepo.getCompletedSessionsForDashboard(db));
    expect(summary.entries.map((e) => e.label)).toContain(stamp?.label);
    expect(bookPageForLabel(summary, stamp!.label)).not.toBeNull();
  });

  it('returns null for a place that already has a stamp, and for a lookup that found nothing', async () => {
    const db = getDb();
    const first = completeASession('stamp-lookup-b1');
    sessionsRepo.applyGeocodeResult(db, first, BEND, nowUtcInstant());
    const again = completeASession('stamp-lookup-b2');
    await expect(
      lookupNewStamp(db, again, 1000, async () =>
        sessionsRepo.applyGeocodeResult(db, again, BEND, nowUtcInstant()),
      ),
    ).resolves.toBeNull();

    const third = completeASession('stamp-lookup-b3');
    await expect(lookupNewStamp(db, third, 1000, async () => {})).resolves.toBeNull();
  });
});
