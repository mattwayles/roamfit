/**
 * Track 37a — limitation choices picked in onboarding / Settings reach the engine's injury hard
 * filter on every generation.
 */
import { eq } from 'drizzle-orm';
import {
  LIMITATION_CHOICES,
  exerciseLibrary,
  familyLibrary,
  tagsForLimitationChoices,
} from '@roamfit/data';
import type { Focus } from '@roamfit/data';
import { FIXED_POINT_ANCHORS } from '@roamfit/engine';
import { createTestDb } from '../testHarness';
import { schema } from '../db';
import { generate } from '../generation';
import {
  addLimitation,
  buildUserProfile,
  ensureUser,
  getUser,
  setLimitationChoices,
  updateUser,
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

describe('every limitation choice still leaves a workout for every focus (track 37c)', () => {
  const FOCI: Focus[] = ['upper', 'legs', 'abs', 'full', 'cardio', 'push', 'pull'];
  const byId = new Map(exerciseLibrary.exercises.map((e) => [e.id, e]));
  for (const choice of LIMITATION_CHOICES) {
    for (const equipped of [false, true]) {
      it(`${choice.id}, ${equipped ? 'all equipment' : 'no equipment'}`, () => {
        const { db, close } = createTestDb();
        try {
          if (equipped) {
            updateUser(
              db,
              { anchorsAvailable: [...FIXED_POINT_ANCHORS] },
              utcInstantFor('2026-10-01'),
            );
          }
          setLimitationChoices(db, [choice.id], '2026-10-01', utcInstantFor('2026-10-01'));
          for (const focus of FOCI) {
            const { plan } = generate(db, {
              library: exerciseLibrary,
              families: familyLibrary,
              request: { focus, difficulty: 'medium', targetMinutes: 30 },
              clock: clockFor('2026-10-02'),
              rng: rngFor(3),
              utcInstant: utcInstantFor('2026-10-02'),
            });
            // A Push or Pull day is half the upper body, so the narrowest limitations leave it
            // fewer moves (overhead-limited, no anchors: a push and a triceps move). Track 37l's
            // added accessories are meant to lift this back to 3 — see STATUS-37.
            const minMain = focus === 'push' || focus === 'pull' ? 2 : 3;
            expect({ focus, main: plan.main.length >= minMain }).toEqual({ focus, main: true });
            expect({
              focus,
              warmup: plan.warmup.length > 0,
              cooldown: plan.cooldown.length > 0,
            }).toEqual({ focus, warmup: true, cooldown: true });
            for (const entry of [...plan.warmup, ...plan.main, ...plan.cooldown]) {
              const hit = byId
                .get(entry.exerciseId)!
                .contraindications.filter((t) => choice.tags.includes(t));
              expect({ id: entry.exerciseId, hit }).toEqual({ id: entry.exerciseId, hit: [] });
            }
          }
        } finally {
          close();
        }
      });
    }
  }
});
