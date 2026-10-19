/**
 * Track 38b — the startup badge backfill rides the first dashboard load of a launch. Runs on the
 * real on-device driver (op-sqlite), so it also proves migration 0034 and the nested savepoint
 * the award uses work there, not just under better-sqlite3.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import {
  badgesRepo,
  completeSession,
  generate,
  schema,
  sessionsRepo,
  usersRepo,
} from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from './localClock';
import { loadDashboardData } from './useDashboardData';

describe('startup badge backfill', () => {
  it('awards missing badges silently on the first load only', () => {
    const db = getDb();
    usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('badge-backfill')),
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
    for (const entry of sessionsRepo.getSession(db, sessionId)!.entries) {
      for (let i = 0; i < entry.sets; i++) {
        sessionsRepo.logSet(
          db,
          {
            entryId: entry.id,
            setIndex: i,
            status: 'completed',
            repsPrescribed: entry.repTarget ?? undefined,
            secondsPrescribed: entry.durationSec ?? undefined,
            repsActual: entry.repTarget ?? undefined,
            secondsActual: entry.durationSec ?? undefined,
            restPrescribedSec: entry.restSec,
            restTakenSec: entry.restSec,
          },
          nowUtcInstant(),
        );
      }
    }
    const result = completeSession(
      db,
      { sessionId, library: exerciseLibrary, families: familyLibrary },
      nowUtcInstant(),
    );
    expect(result.newBadgeIds).toContain('sessions_1');
    // Pretend this history predates badges.
    db.delete(schema.earnedBadges).run();

    loadDashboardData(db, exerciseLibrary, familyLibrary);
    const first = badgesRepo.getEarnedBadges(db);
    expect(first.map((b) => b.badgeId)).toContain('sessions_1');
    expect(first.every((b) => b.retroactive && b.sessionId === null)).toBe(true);
    expect(badgesRepo.countUnseen(db)).toBe(first.length);

    db.delete(schema.earnedBadges).run();
    loadDashboardData(db, exerciseLibrary, familyLibrary);
    expect(badgesRepo.getEarnedBadges(db)).toEqual([]); // once per launch
  });
});
