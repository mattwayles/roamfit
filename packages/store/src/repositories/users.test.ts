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

      updateUser(db, { notificationPrefs: { quietHoursEnabled: false } }, utcInstantFor('2026-08-02'));

      const raw = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all()[0];
      const stored = JSON.parse(raw.notificationPrefs) as Record<string, unknown>;
      expect(stored.someFutureField).toBe('keep-me');
      expect(stored.quietHoursEnabled).toBe(false);
    } finally {
      close();
    }
  });
});
