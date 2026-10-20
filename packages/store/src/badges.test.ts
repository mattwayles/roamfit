/**
 * Track 38b — badge facts, award at completion, and the silent backfill, against real fixture
 * sessions (generate -> log -> complete) rather than hand-written rows.
 */
import { BADGES } from '@roamfit/engine';
import type { Focus } from '@roamfit/data';
import { createTestDb } from './testHarness';
import type { TestDb } from './testHarness';
import { generate } from './generation';
import {
  createPendingSession,
  getPendingSession,
  getSession,
  logSet,
  startSession,
} from './repositories/sessions';
import { completeSession } from './completion';
import type { CompleteSessionResult } from './completion';
import { updateUser, ensureUser } from './repositories/users';
import { getEarnedBadges, getEarnedBadgeIds } from './repositories/badges';
import { getSignalEventsByType } from './repositories/signals';
import { getAllMilestones } from './repositories/milestones';
import { lifetimeSets } from './repositories/stats';
import { buildBadgeFacts, localHourOf } from './badgeFacts';
import { awardBadges, backfillBadges } from './badgeAward';
import {
  library,
  singleExerciseFamilies as families,
  clockFor,
  rngFor,
  utcInstantFor,
} from './testFixtures';

interface RunOpts {
  tzId?: string;
  /** Instant the workout starts; defaults to 09:00Z on `localDate`. */
  startedAt?: string;
  focus?: Focus;
  difficulty?: 'easy' | 'medium' | 'hard';
  bonus?: number;
  seed?: number;
  /** Leave the last main set of every entry unlogged-as-skipped. */
  skipOneSet?: boolean;
}

function runSession(
  db: TestDb['db'],
  localDate: string,
  opts: RunOpts = {},
): { sessionId: string; result: CompleteSessionResult } {
  const tzId = opts.tzId ?? 'America/New_York';
  const startedAt = opts.startedAt ?? utcInstantFor(localDate, 9);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: {
      focus: opts.focus ?? 'upper',
      difficulty: opts.difficulty ?? 'medium',
      targetMinutes: 30,
    },
    clock: clockFor(localDate, tzId),
    rng: rngFor(opts.seed ?? 1),
    utcInstant: startedAt,
  });
  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: startedAt,
    localDate,
    tzId,
    comebackTier,
    recoveryWeekManual,
  });
  startSession(db, sessionId, startedAt);
  const session = getPendingSession(db)!;
  let skipped = false;
  for (const entry of session.entries) {
    for (let i = 0; i < entry.sets; i++) {
      const skip = opts.skipOneSet && entry.section === 'main' && !skipped && i === entry.sets - 1;
      if (skip) skipped = true;
      logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: skip ? 'skipped' : 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: skip
            ? undefined
            : entry.repTarget != null
              ? entry.repTarget + (opts.bonus ?? 0)
              : undefined,
          secondsActual: skip
            ? undefined
            : entry.durationSec != null
              ? entry.durationSec + (opts.bonus ?? 0)
              : undefined,
          restPrescribedSec: entry.restSec,
          restTakenSec: entry.restSec,
        },
        new Date(Date.parse(startedAt) + (i + 1) * 120_000).toISOString(),
      );
    }
  }
  const finishedAt = new Date(Date.parse(startedAt) + 3_600_000).toISOString();
  const result = completeSession(db, { sessionId, library, families }, finishedAt);
  return { sessionId, result };
}

describe('earned_badges migration', () => {
  it('applies and starts empty', () => {
    const { db, raw, close } = createTestDb();
    try {
      const cols = (
        raw.prepare('PRAGMA table_info(earned_badges)').all() as { name: string }[]
      ).map((c) => c.name);
      expect(cols).toEqual([
        'badge_id',
        'user_id',
        'earned_at',
        'local_date',
        'session_id',
        'retroactive',
        'seen_at',
        'payload',
      ]);
      expect(getEarnedBadges(db)).toEqual([]);
    } finally {
      close();
    }
  });
});

describe('buildBadgeFacts', () => {
  it('is all zeros for a fresh install', () => {
    const { db, close } = createTestDb();
    try {
      const f = buildBadgeFacts(db, library, families);
      expect(f.sessionsCompleted).toBe(0);
      expect(f.lifetimeSets).toBe(0);
      expect(f.heaviestBandOrdinal).toBe(-1);
      expect(f.focusesTrained).toEqual([]);
      expect(f.passportEnabled).toBe(false);
    } finally {
      close();
    }
  });

  it('counts a completed session: sets, reps, minutes, focus, weeks, hard sessions', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-04-01', { difficulty: 'hard', focus: 'legs' });
      runSession(db, '2026-04-03', { focus: 'upper', bonus: 3 });
      const f = buildBadgeFacts(db, library, families);
      expect(f.sessionsCompleted).toBe(2);
      expect(f.hardSessionsCompleted).toBe(1);
      expect([...f.focusesTrained].sort()).toEqual(['legs', 'upper']);
      expect(f.distinctActiveWeeks).toBe(1); // Wed and Fri of the same ISO week
      expect(f.totalMinutes).toBeGreaterThan(0);
      expect(f.longestSessionMinutes).toBeGreaterThan(0);
      expect(f.lifetimeReps + f.lifetimeHoldSeconds).toBeGreaterThan(0);
      expect(f.lifetimeSets).toBeGreaterThan(0);
      expect(f.distinctExercisesPerformed).toBeGreaterThan(0);
      // Main work only: never more than every completed set (which also counts prep).
      expect(f.lifetimeSets).toBeLessThanOrEqual(lifetimeSets(db));
      expect(f.familyCount).toBe(families.families.length);
      // Nothing has been climbed yet, so no rung counts.
      expect(f.highestLevelOrdinal).toBe(0);
    } finally {
      close();
    }
  });

  it('week math and time of day use local_date and the session tz, across a timezone change', () => {
    const { db, close } = createTestDb();
    try {
      // Auckland (UTC+13 in March): local Mon 2 Mar 06:30 -- but UTC says Sun 1 Mar 17:30.
      runSession(db, '2026-03-02', {
        tzId: 'Pacific/Auckland',
        startedAt: '2026-03-01T17:30:00.000Z',
        seed: 1,
      });
      // New York (UTC-5): local Thu 5 Mar 22:00 -- UTC says Fri 6 Mar 03:00 (an "early" hour).
      runSession(db, '2026-03-05', {
        tzId: 'America/New_York',
        startedAt: '2026-03-06T03:00:00.000Z',
        seed: 2,
      });
      const f = buildBadgeFacts(db, library, families);
      // Both are ISO week 10 by local_date; by UTC date they would straddle W09/W10.
      expect(f.distinctActiveWeeks).toBe(1);
      expect(f.earlySessions).toBe(1); // 06:30 Auckland; UTC hour 17 would not be early
      expect(f.lateSessions).toBe(1); // 22:00 New York; UTC hour 03 would read as early
    } finally {
      close();
    }
  });

  it('counts comebacks on local dates, never the first session', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-01-05', { seed: 1 });
      runSession(db, '2026-01-18', { seed: 2 }); // 13 days: not a comeback
      runSession(db, '2026-02-01', { seed: 3 }); // 14 days: a comeback
      expect(buildBadgeFacts(db, library, families).comebacks).toBe(1);
    } finally {
      close();
    }
  });

  it('clean sweep needs every planned main set done (and 6+ of them)', () => {
    const { db, close } = createTestDb();
    try {
      const { sessionId } = runSession(db, '2026-04-01');
      const mainSets = getSession(db, sessionId)!
        .entries.filter((e) => e.section === 'main')
        .reduce((n, e) => n + e.sets, 0);
      const first = buildBadgeFacts(db, library, families).cleanSweepSessions;
      expect(first).toBe(mainSets >= 6 ? 1 : 0);
      runSession(db, '2026-04-03', { seed: 2, skipOneSet: true });
      expect(buildBadgeFacts(db, library, families).cleanSweepSessions).toBe(first);
    } finally {
      close();
    }
  });

  it('counts passport places the way the app labels them', () => {
    const { db, raw, close } = createTestDb();
    try {
      ensureUser(db, '2026-04-01T00:00:00.000Z');
      updateUser(db, { passportEnabled: true }, '2026-04-01T00:00:00.000Z');
      const a = runSession(db, '2026-04-01', { seed: 1 }).sessionId;
      const b = runSession(db, '2026-04-02', { seed: 2 }).sessionId;
      const c = runSession(db, '2026-04-03', { seed: 3 }).sessionId;
      const set = raw.prepare(
        'UPDATE sessions SET city = ?, region = ?, country = ?, country_code = ? WHERE id = ?',
      );
      set.run('Bend', 'OR', 'United States', 'US', a);
      set.run('Bend', 'or', 'United States', 'us', b); // same label: case-insensitive
      set.run('Banff', 'AB', 'Canada', 'CA', c);
      const f = buildBadgeFacts(db, library, families);
      expect(f.passportEnabled).toBe(true);
      expect(f.citiesVisited).toBe(2);
      expect(f.countriesVisited).toBe(2);
    } finally {
      close();
    }
  });

  it('localHourOf converts through the zone and tolerates a bad one', () => {
    expect(localHourOf('2026-03-06T03:00:00.000Z', 'America/New_York')).toBe(22);
    expect(localHourOf('2026-03-06T03:00:00.000Z', 'Not/AZone')).toBeNull();
  });
});

describe('awarding at completion', () => {
  it('the first workout earns First Steps, and facts include the session being completed', () => {
    const { db, close } = createTestDb();
    try {
      const { sessionId, result } = runSession(db, '2026-04-01');
      expect(result.newBadgeIds).toContain('sessions_1');
      const row = getEarnedBadges(db).find((r) => r.badgeId === 'sessions_1')!;
      expect(row).toMatchObject({
        sessionId,
        localDate: '2026-04-01',
        retroactive: false,
        seenAt: null,
      });
      expect(row.payload).toEqual({ value: 1 });
    } finally {
      close();
    }
  });

  it('crossing a threshold awards exactly that tier, once, and never again', () => {
    const { db, close } = createTestDb();
    try {
      const results: CompleteSessionResult[] = [];
      for (let i = 0; i < 6; i++) {
        results.push(runSession(db, `2026-04-0${i + 1}`, { seed: i + 1 }).result);
      }
      const awardedAt = results.map((r) =>
        r.newBadgeIds.filter((id) => id.startsWith('sessions_')),
      );
      expect(awardedAt).toEqual([['sessions_1'], [], [], [], ['sessions_5'], []]);
      // Every id handed back is a real catalog entry and was saved.
      const catalogIds = new Set(BADGES.map((b) => b.id));
      const held = getEarnedBadgeIds(db);
      for (const r of results) {
        for (const id of r.newBadgeIds) {
          expect(catalogIds.has(id)).toBe(true);
          expect(held.has(id)).toBe(true);
        }
      }
      // No id was announced twice across the run.
      const all = results.flatMap((r) => r.newBadgeIds);
      expect(new Set(all).size).toBe(all.length);
      expect(held.size).toBe(all.length);
    } finally {
      close();
    }
  });

  it('awardBadges called again with nothing new earns nothing', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-04-01');
      const again = awardBadges(
        db,
        { library, families, sessionId: null, localDate: '2026-04-01', retroactive: false },
        '2026-04-01T12:00:00.000Z',
      );
      expect(again).toEqual([]);
    } finally {
      close();
    }
  });

  it('a best-set record day earns its badges from the milestones written in the same completion', () => {
    const { db, close } = createTestDb();
    try {
      runSession(db, '2026-04-01', { seed: 1, bonus: 0 });
      const { result } = runSession(db, '2026-04-03', { seed: 1, bonus: 6 });
      const prs = getAllMilestones(db).filter((m) => m.type === 'best_set_pr').length;
      expect(prs).toBeGreaterThan(0);
      expect(result.newBadgeIds).toContain('best_sets_1');
    } finally {
      close();
    }
  });

  it('a failure inside badge code never breaks completion, and is logged', () => {
    const { db, raw, close } = createTestDb();
    try {
      raw.exec('DROP TABLE earned_badges');
      const { sessionId, result } = runSession(db, '2026-04-01');
      expect(result.newBadgeIds).toEqual([]);
      const session = getSession(db, sessionId)!;
      expect(session.status).toBe('completed');
      expect(getAllMilestones(db).some((m) => m.type === 'nth_session')).toBe(true);
      const errors = getSignalEventsByType(db, 'badge_error');
      expect(errors).toHaveLength(1);
      expect(errors[0].sessionId).toBe(sessionId);
      expect(errors[0].payload).toMatchObject({ stage: 'completion' });
    } finally {
      close();
    }
  });
});

describe('backfillBadges', () => {
  function historyWithoutBadges(db: TestDb['db'], raw: TestDb['raw']) {
    for (let i = 0; i < 5; i++) runSession(db, `2026-04-0${i + 1}`, { seed: i + 1 });
    raw.exec('DELETE FROM earned_badges'); // history from before badges existed
  }

  it('awards what the user already qualifies for, silently and retroactively', () => {
    const { db, raw, close } = createTestDb();
    try {
      historyWithoutBadges(db, raw);
      const ids = backfillBadges(db, library, families, '2026-05-01T12:00:00.000Z', 'UTC');
      expect(ids).toEqual(expect.arrayContaining(['sessions_1', 'sessions_5']));
      const rows = getEarnedBadges(db);
      expect(rows.length).toBe(ids.length);
      for (const r of rows) {
        expect(r).toMatchObject({
          retroactive: true,
          sessionId: null,
          seenAt: null,
          localDate: '2026-05-01',
        });
      }
    } finally {
      close();
    }
  });

  it('is idempotent, and later completions do not re-announce backfilled badges', () => {
    const { db, raw, close } = createTestDb();
    try {
      historyWithoutBadges(db, raw);
      const first = backfillBadges(db, library, families, '2026-05-01T12:00:00.000Z', 'UTC');
      const second = backfillBadges(db, library, families, '2026-05-02T12:00:00.000Z', 'UTC');
      expect(first.length).toBeGreaterThan(0);
      expect(second).toEqual([]);
      expect(getEarnedBadges(db).length).toBe(first.length);
      const { result } = runSession(db, '2026-05-03', { seed: 9 });
      expect(result.newBadgeIds).not.toContain('sessions_1');
      expect(result.newBadgeIds).not.toContain('sessions_5');
    } finally {
      close();
    }
  });

  it('does nothing for a fresh install and never throws', () => {
    const { db, raw, close } = createTestDb();
    try {
      expect(backfillBadges(db, library, families, '2026-05-01T12:00:00.000Z', 'UTC')).toEqual([]);
      raw.exec('DROP TABLE earned_badges');
      expect(backfillBadges(db, library, families, '2026-05-01T12:00:00.000Z', 'UTC')).toEqual([]);
      expect(getSignalEventsByType(db, 'badge_error')[0].payload).toMatchObject({
        stage: 'backfill',
      });
    } finally {
      close();
    }
  });
});
