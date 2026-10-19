/**
 * Track 37i — owned bands, stacking and the band editor, stored on the user row (migration 0033)
 * and honoured by generation.
 */
import { eq } from 'drizzle-orm';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { DEFAULT_BAND_SETTINGS, FIXED_POINT_ANCHORS } from '@roamfit/engine';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { generate } from '../generation';
import { DEFAULT_BAND_TENSIONS, ensureUser, getUser, updateBandTension, updateUser } from './users';
import { clockFor, rngFor, utcInstantFor } from '../testFixtures';

describe('band settings (migration 0033)', () => {
  it('a new user owns no bands and does not stack; an unreadable row reads as every band', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-18')).bandSettings).toEqual({
        owned: [],
        stacking: false,
      });
      db.update(schema.users).set({ bandSettings: '{}' }).where(eq(schema.users.id, 'local')).run();
      expect(getUser(db)!.bandSettings).toEqual(DEFAULT_BAND_SETTINGS);
    } finally {
      close();
    }
  });

  it('merges updates into the stored settings', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-10-18'));
      updateUser(db, { bandSettings: { owned: ['B2', 'B4'] } }, utcInstantFor('2026-10-18'));
      updateUser(db, { bandSettings: { stacking: true } }, utcInstantFor('2026-10-18'));
      expect(getUser(db)!.bandSettings).toEqual({ owned: ['B2', 'B4'], stacking: true });
    } finally {
      close();
    }
  });

  it('drops unknown bands and survives damage', () => {
    const { db, close } = createTestDb();
    try {
      ensureUser(db, utcInstantFor('2026-10-18'));
      const set = (v: string) =>
        db.update(schema.users).set({ bandSettings: v }).where(eq(schema.users.id, 'local')).run();
      set('{"owned":["B9","B3","B5+B1"],"stacking":"yes"}');
      expect(getUser(db)!.bandSettings).toEqual({ owned: ['B3'], stacking: false });
      set('nope');
      expect(getUser(db)!.bandSettings).toEqual(DEFAULT_BAND_SETTINGS);
    } finally {
      close();
    }
  });

  it('renames and recolours one band without touching the others', () => {
    const { db, close } = createTestDb();
    try {
      updateBandTension(db, 'B2', { label: 'Red' }, utcInstantFor('2026-10-18'));
      updateBandTension(db, 'B2', { color: '#ff0000' }, utcInstantFor('2026-10-18'));
      const tensions = getUser(db)!.bandTensions;
      expect(tensions.B2).toEqual({ label: 'Red', color: '#ff0000' });
      expect(tensions.B3).toEqual(DEFAULT_BAND_TENSIONS.B3);
    } finally {
      close();
    }
  });

  it('generation only prescribes owned bands', () => {
    const { db, close } = createTestDb();
    try {
      updateUser(
        db,
        { anchorsAvailable: [...FIXED_POINT_ANCHORS], bandSettings: { owned: ['B3'] } },
        utcInstantFor('2026-10-18'),
      );
      for (const focus of ['upper', 'legs'] as const) {
        const { plan } = generate(db, {
          library: exerciseLibrary,
          families: familyLibrary,
          request: { focus, difficulty: 'medium', targetMinutes: 45 },
          clock: clockFor('2026-10-18'),
          rng: rngFor(4),
          utcInstant: utcInstantFor('2026-10-18'),
        });
        for (const e of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
          if (e.band) expect(e.band).toBe('B3');
        }
      }
    } finally {
      close();
    }
  });
});
