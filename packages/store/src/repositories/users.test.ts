/**
 * §13.3 disclaimer gate + notification-prefs merge behavior — both new in Wave 7. No existing
 * test file covered `users.ts` at all before this.
 */
import { eq } from 'drizzle-orm';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { acknowledgeDisclaimer, ensureUser, getUser, updateUser } from './users';
import { utcInstantFor } from '../testFixtures';

describe('§13.3 first-launch disclaimer acknowledgement', () => {
  it('defaults to false on a fresh user row, and acknowledgeDisclaimer flips it — one way', () => {
    const { db, close } = createTestDb();
    try {
      const fresh = ensureUser(db, utcInstantFor('2026-08-01'));
      expect(fresh.hasAcknowledgedDisclaimer).toBe(false);

      acknowledgeDisclaimer(db, utcInstantFor('2026-08-01', 9));
      expect(getUser(db)!.hasAcknowledgedDisclaimer).toBe(true);
    } finally {
      close();
    }
  });

  it('is idempotent — acknowledging twice is not an error and stays true', () => {
    const { db, close } = createTestDb();
    try {
      acknowledgeDisclaimer(db, utcInstantFor('2026-08-01'));
      acknowledgeDisclaimer(db, utcInstantFor('2026-08-02'));
      expect(getUser(db)!.hasAcknowledgedDisclaimer).toBe(true);
    } finally {
      close();
    }
  });
});

describe('notificationPrefs — shallow merge, not replace', () => {
  it('a quietHoursEnabled patch does not clobber other existing prefs keys', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      // Seed an unrelated key the same way a future settings field might, by patching directly —
      // simulates "some other prefs field was already set before this patch."
      updateUser(
        db,
        { notificationPrefs: { quietHoursEnabled: false } },
        utcInstantFor('2026-08-01'),
      );
      expect(getUser(db)!.notificationPrefs.quietHoursEnabled).toBe(false);

      // A second, unrelated-looking patch call (empty object) must not silently reset the first.
      updateUser(db, { notificationPrefs: {} }, utcInstantFor('2026-08-02'));
      expect(getUser(db)!.notificationPrefs.quietHoursEnabled).toBe(false);
    } finally {
      close();
    }
  });

  it('a motivationTimes patch does not clobber quietHoursEnabled, and vice versa', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      updateUser(
        db,
        { notificationPrefs: { quietHoursEnabled: false } },
        utcInstantFor('2026-08-01'),
      );
      updateUser(
        db,
        { notificationPrefs: { motivationTimes: ['08:00', '13:00'] } },
        utcInstantFor('2026-08-02'),
      );
      const prefs = getUser(db)!.notificationPrefs;
      expect(prefs.quietHoursEnabled).toBe(false);
      expect(prefs.motivationTimes).toEqual(['08:00', '13:00']);
    } finally {
      close();
    }
  });

  it('mutation check: a wholesale-replace implementation would lose an unrelated existing key', () => {
    // Seeds a field the current `NotificationPrefs` interface doesn't declare (forward-
    // compatibility: a future settings field, or data written by an older/newer build) directly
    // into the raw JSON column, then patches only `quietHoursEnabled` through the real API and
    // confirms the seeded field survives. A `values.notificationPrefs =
    // JSON.stringify(patch.notificationPrefs)` replace (no spread of `current.notificationPrefs`)
    // would lose it — this is exactly the regression the merge exists to prevent.
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      db.update(schema.users)
        .set({ notificationPrefs: JSON.stringify({ someFutureField: 'keep-me' }) })
        .where(eq(schema.users.id, 'local'))
        .run();

      updateUser(
        db,
        { notificationPrefs: { quietHoursEnabled: false } },
        utcInstantFor('2026-08-02'),
      );

      const raw = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all()[0];
      const stored = JSON.parse(raw.notificationPrefs) as Record<string, unknown>;
      expect(stored.someFutureField).toBe('keep-me');
      expect(stored.quietHoursEnabled).toBe(false);
    } finally {
      close();
    }
  });
});

describe('themePreference (migration 0022)', () => {
  it('defaults to system on a fresh user row', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-08-01')).themePreference).toBe('system');
    } finally {
      close();
    }
  });

  it('round-trips light / dark / system through updateUser', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      for (const pref of ['light', 'dark', 'system'] as const) {
        updateUser(db, { themePreference: pref }, utcInstantFor('2026-08-02'));
        expect(getUser(db)!.themePreference).toBe(pref);
      }
    } finally {
      close();
    }
  });

  it('an unrelated patch leaves the preference alone', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      updateUser(db, { themePreference: 'light' }, utcInstantFor('2026-08-02'));
      updateUser(db, { cueSoundsEnabled: false }, utcInstantFor('2026-08-03'));
      expect(getUser(db)!.themePreference).toBe('light');
    } finally {
      close();
    }
  });
});

describe('spotifyVibes (migration 0023)', () => {
  it('defaults to an empty list and round-trips through updateUser', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-08-01')).spotifyVibes).toEqual([]);
      updateUser(db, { spotifyVibes: ['rock', '80s'] }, utcInstantFor('2026-08-02'));
      expect(getUser(db)!.spotifyVibes).toEqual(['rock', '80s']);
      updateUser(db, { units: 'kg' }, utcInstantFor('2026-08-03'));
      expect(getUser(db)!.spotifyVibes).toEqual(['rock', '80s']);
      updateUser(db, { spotifyVibes: [] }, utcInstantFor('2026-08-04'));
      expect(getUser(db)!.spotifyVibes).toEqual([]);
    } finally {
      close();
    }
  });

  it('malformed JSON reads as [] and non-string entries are filtered', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      const set = (v: string) =>
        db.update(schema.users).set({ spotifyVibes: v }).where(eq(schema.users.id, 'local')).run();
      set('{not json');
      expect(getUser(db)!.spotifyVibes).toEqual([]);
      set('"rock"');
      expect(getUser(db)!.spotifyVibes).toEqual([]);
      set('["rock", 3, null, "metal"]');
      expect(getUser(db)!.spotifyVibes).toEqual(['rock', 'metal']);
    } finally {
      close();
    }
  });
});
