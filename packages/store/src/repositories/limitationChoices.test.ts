/**
 * Track 37a — limitation choices picked in onboarding / Settings reach the engine's injury hard
 * filter on every generation.
 */
import { eq } from 'drizzle-orm';
import { exerciseLibrary, familyLibrary, tagsForLimitationChoices } from '@roamfit/data';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { generate } from '../generation';
import {
  addLimitation,
  buildUserProfile,
  ensureUser,
  getUser,
  setLimitationChoices,
} from './users';
import { clockFor, rngFor, utcInstantFor } from '../testFixtures';

describe('limitation choices (migration 0029)', () => {
  it('default to none, round-trip, and keep the original since date for a kept choice', () => {
    const { db, close } = createTestDb();
    try {
      expect(ensureUser(db, utcInstantFor('2026-10-01')).limitationChoices).toEqual([]);
      setLimitationChoices(db, ['knee', 'wrist'], '2026-10-01', utcInstantFor('2026-10-01'));
      setLimitationChoices(db, ['knee', 'pregnancy'], '2026-10-05', utcInstantFor('2026-10-05'));
      expect(getUser(db)!.limitationChoices).toEqual([
        { id: 'knee', since: '2026-10-01' },
        { id: 'pregnancy', since: '2026-10-05' },
      ]);
      setLimitationChoices(db, [], '2026-10-06', utcInstantFor('2026-10-06'));
      expect(getUser(db)!.limitationChoices).toEqual([]);
    } finally {
      close();
    }
  });

  it('ignores unknown ids on write and drops damaged or unknown entries on read', () => {
    const { db, close } = createTestDb();
    try {
      setLimitationChoices(db, ['knee', 'not-a-choice'], '2026-10-01', utcInstantFor('2026-10-01'));
      expect(getUser(db)!.limitationChoices.map((c) => c.id)).toEqual(['knee']);
      const set = (v: string) =>
        db
          .update(schema.users)
          .set({ limitationChoices: v })
          .where(eq(schema.users.id, 'local'))
          .run();
      set('{not json');
      expect(getUser(db)!.limitationChoices).toEqual([]);
      set(
        '[{"id":"retired","since":"2026-01-01"},{"id":"hip"},{"id":"neck","since":"2026-02-02"}]',
      );
      expect(getUser(db)!.limitationChoices).toEqual([{ id: 'neck', since: '2026-02-02' }]);
    } finally {
      close();
    }
  });

  it('expand into one engine limitation per tag, alongside dated limitation rows', () => {
    const { db, close } = createTestDb();
    try {
      setLimitationChoices(db, ['knee', 'low_impact'], '2026-10-01', utcInstantFor('2026-10-01'));
      addLimitation(
        db,
        { tag: 'elbow', source: 'pain_report', expiresAt: '2026-10-20' },
        utcInstantFor('2026-10-01'),
      );
      const tags = buildUserProfile(db, '2026-10-02')
        .limitations.map((l) => l.tag)
        .sort();
      // knee_impact is shared by both choices and appears once.
      expect(tags).toEqual(['elbow', 'knee_flexion_loaded', 'knee_impact']);
    } finally {
      close();
    }
  });

  it('remove every exercise carrying a chosen tag from a generated session', () => {
    const { db, close } = createTestDb();
    try {
      setLimitationChoices(db, ['knee', 'wrist'], '2026-10-01', utcInstantFor('2026-10-01'));
      const banned = new Set(tagsForLimitationChoices(['knee', 'wrist']));
      const byId = new Map(exerciseLibrary.exercises.map((e) => [e.id, e]));
      for (const focus of ['legs', 'upper', 'full'] as const) {
        const { plan } = generate(db, {
          library: exerciseLibrary,
          families: familyLibrary,
          request: { focus, difficulty: 'medium', targetMinutes: 45 },
          clock: clockFor('2026-10-02'),
          rng: rngFor(7),
          utcInstant: utcInstantFor('2026-10-02'),
        });
        const entries = [...plan.warmup, ...plan.main, ...plan.cooldown];
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          const tags = byId.get(entry.exerciseId)!.contraindications;
          expect(tags.filter((t) => banned.has(t))).toEqual([]);
        }
      }
    } finally {
      close();
    }
  });
});
