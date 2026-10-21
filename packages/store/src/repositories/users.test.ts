/**
 * §13.3 disclaimer gate + notification-prefs merge behavior — both new in Wave 7. No existing
 * test file covered `users.ts` at all before this.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import {
  acknowledgeDisclaimer,
  beginOnboarding,
  ensureUser,
  finishOnboarding,
  getUser,
  updateUser,
} from './users';
import { utcInstantFor } from '../testFixtures';
import { MIGRATIONS } from '../migrations/data';

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
  it('a motivationEnabled patch does not clobber other existing prefs keys', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      // Seed an unrelated key the same way a future settings field might, by patching directly —
      // simulates "some other prefs field was already set before this patch."
      updateUser(
        db,
        { notificationPrefs: { motivationEnabled: false } },
        utcInstantFor('2026-08-01'),
      );
      expect(getUser(db)!.notificationPrefs.motivationEnabled).toBe(false);

      // A second, unrelated-looking patch call (empty object) must not silently reset the first.
      updateUser(db, { notificationPrefs: {} }, utcInstantFor('2026-08-02'));
      expect(getUser(db)!.notificationPrefs.motivationEnabled).toBe(false);
    } finally {
      close();
    }
  });

  it('a motivationTimes patch does not clobber motivationEnabled, and vice versa', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-08-01'));
      updateUser(
        db,
        { notificationPrefs: { motivationEnabled: false } },
        utcInstantFor('2026-08-01'),
      );
      updateUser(
        db,
        { notificationPrefs: { motivationTimes: ['08:00', '13:00'] } },
        utcInstantFor('2026-08-02'),
      );
      const prefs = getUser(db)!.notificationPrefs;
      expect(prefs.motivationEnabled).toBe(false);
      expect(prefs.motivationTimes).toEqual(['08:00', '13:00']);
    } finally {
      close();
    }
  });

  it('mutation check: a wholesale-replace implementation would lose an unrelated existing key', () => {
    // Seeds a field the current `NotificationPrefs` interface doesn't declare (forward-
    // compatibility: a future settings field, or data written by an older/newer build) directly
    // into the raw JSON column, then patches only `motivationEnabled` through the real API and
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
        { notificationPrefs: { motivationEnabled: false } },
        utcInstantFor('2026-08-02'),
      );

      const raw = db.select().from(schema.users).where(eq(schema.users.id, 'local')).all()[0];
      const stored = JSON.parse(raw.notificationPrefs) as Record<string, unknown>;
      expect(stored.someFutureField).toBe('keep-me');
      expect(stored.motivationEnabled).toBe(false);
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

describe('feedbackPromptEnabled (migration 0025)', () => {
  it('defaults to on and round-trips through updateUser', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-08-01')).feedbackPromptEnabled).toBe(true);
      updateUser(db, { feedbackPromptEnabled: false }, utcInstantFor('2026-08-02'));
      expect(getUser(db)!.feedbackPromptEnabled).toBe(false);
      updateUser(db, { units: 'kg' }, utcInstantFor('2026-08-03'));
      expect(getUser(db)!.feedbackPromptEnabled).toBe(false);
    } finally {
      close();
    }
  });
});

describe('anchorsAvailable for a new user (track 37b)', () => {
  it('starts empty, so nothing needing a fixed point, bar or bench is programmed until chosen', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-18')).anchorsAvailable).toEqual([]);
      updateUser(db, { anchorsAvailable: ['anchor-mid'] }, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.anchorsAvailable).toEqual(['anchor-mid']);
    } finally {
      close();
    }
  });
});

describe('onboarding state (migration 0032)', () => {
  it('begins with the disclaimer, survives a relaunch in progress, and finishes', () => {
    const { db, close } = createTestDb();
    try {
      const fresh = ensureUser(db, utcInstantFor('2026-10-18'));
      expect(fresh.hasAcknowledgedDisclaimer).toBe(false);
      expect(fresh.onboardingInProgress).toBe(false);
      beginOnboarding(db, utcInstantFor('2026-10-18'));
      expect(getUser(db)).toMatchObject({
        hasAcknowledgedDisclaimer: true,
        onboardingInProgress: true,
      });
      finishOnboarding(db, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.onboardingInProgress).toBe(false);
    } finally {
      close();
    }
  });

  it('acknowledging the disclaimer alone (an install from before onboarding) is not in progress', () => {
    const { db, close } = createTestDb();
    try {
      acknowledgeDisclaimer(db, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.onboardingInProgress).toBe(false);
    } finally {
      close();
    }
  });
});

describe('bandsSetUp (migration 0035)', () => {
  it('is false for a new user and round-trips through updateUser', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-18')).bandsSetUp).toBe(false);
      updateUser(db, { bandsSetUp: true }, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.bandsSetUp).toBe(true);
      updateUser(db, { cueSoundsEnabled: false }, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.bandsSetUp).toBe(true);
    } finally {
      close();
    }
  });

  it('counts every user row that existed before the migration as set up', () => {
    const raw = new Database(':memory:');
    try {
      const index = MIGRATIONS.findIndex((m) => m.id === '0035_bands_set_up.sql');
      for (const m of MIGRATIONS.slice(0, index)) raw.exec(m.sql);
      raw
        .prepare(
          "INSERT INTO users (id, anchors_available, created_at, updated_at) VALUES ('local', '[]', 'x', 'x')",
        )
        .run();
      raw.exec(MIGRATIONS[index].sql);
      expect(raw.prepare('SELECT bands_set_up FROM users').get()).toEqual({ bands_set_up: 1 });
    } finally {
      raw.close();
    }
  });
});

describe('iCloud backup settings (migration 0039)', () => {
  it('a new user has backup enabled and no pending decision; both round-trip through updateUser', () => {
    const { db, close } = createTestDb();
    try {
      const fresh = ensureUser(db, utcInstantFor('2026-10-20'));
      expect(fresh.icloudBackupEnabled).toBe(true);
      expect(fresh.backupDecisionPending).toBe(false);

      updateUser(db, { backupDecisionPending: true }, utcInstantFor('2026-10-20'));
      expect(getUser(db)).toMatchObject({ icloudBackupEnabled: true, backupDecisionPending: true });
      updateUser(
        db,
        { icloudBackupEnabled: false, backupDecisionPending: false },
        utcInstantFor('2026-10-20'),
      );
      expect(getUser(db)).toMatchObject({
        icloudBackupEnabled: false,
        backupDecisionPending: false,
      });
      updateUser(db, { cueSoundsEnabled: false }, utcInstantFor('2026-10-20'));
      expect(getUser(db)!.icloudBackupEnabled).toBe(false);
    } finally {
      close();
    }
  });

  it('opts every user row that existed before the migration in, with no pending decision', () => {
    const raw = new Database(':memory:');
    try {
      const index = MIGRATIONS.findIndex((m) => m.id === '0039_icloud_backup.sql');
      for (const m of MIGRATIONS.slice(0, index)) raw.exec(m.sql);
      raw
        .prepare(
          "INSERT INTO users (id, anchors_available, created_at, updated_at) VALUES ('local', '[]', 'x', 'x')",
        )
        .run();
      raw.exec(MIGRATIONS[index].sql);
      expect(
        raw.prepare('SELECT icloud_backup_enabled, backup_decision_pending FROM users').get(),
      ).toEqual({ icloud_backup_enabled: 1, backup_decision_pending: 0 });
    } finally {
      raw.close();
    }
  });
});

describe('iCloud backup linked (migration 0040)', () => {
  it('starts false and round-trips through updateUser without disturbing other fields', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-20')).icloudBackupLinked).toBe(false);
      updateUser(db, { icloudBackupLinked: true }, utcInstantFor('2026-10-20'));
      expect(getUser(db)).toMatchObject({ icloudBackupLinked: true, icloudBackupEnabled: true });
      updateUser(db, { cueSoundsEnabled: false }, utcInstantFor('2026-10-20'));
      expect(getUser(db)!.icloudBackupLinked).toBe(true);
    } finally {
      close();
    }
  });

  it('leaves every user row that existed before the migration unlinked', () => {
    const raw = new Database(':memory:');
    try {
      const index = MIGRATIONS.findIndex((m) => m.id === '0040_icloud_backup_linked.sql');
      for (const m of MIGRATIONS.slice(0, index)) raw.exec(m.sql);
      raw
        .prepare(
          "INSERT INTO users (id, anchors_available, created_at, updated_at) VALUES ('local', '[]', 'x', 'x')",
        )
        .run();
      raw.exec(MIGRATIONS[index].sql);
      expect(raw.prepare('SELECT icloud_backup_linked FROM users').get()).toEqual({
        icloud_backup_linked: 0,
      });
    } finally {
      raw.close();
    }
  });
});
