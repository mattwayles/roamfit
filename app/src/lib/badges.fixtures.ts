/** Test helpers for the badge shelf: an all-zero facts snapshot and an earned-row builder. */
import type { BadgeFacts } from '@roamfit/engine';
import type { EarnedBadgeRecord } from './badges';

export function emptyBadgeFacts(over: Partial<BadgeFacts> = {}): BadgeFacts {
  return {
    sessionsCompleted: 0,
    totalMinutes: 0,
    distinctActiveWeeks: 0,
    focusesTrained: [],
    hardSessionsCompleted: 0,
    cleanSweepSessions: 0,
    longestSessionMinutes: 0,
    earlySessions: 0,
    lateSessions: 0,
    levelUpsTotal: 0,
    highestLevelOrdinal: 0,
    familiesAtTop: [],
    familyCount: 8,
    familiesAtOrAbove3: 0,
    bestSetPrsTotal: 0,
    maxPrsInOneSession: 0,
    lifetimeReps: 0,
    lifetimeHoldSeconds: 0,
    lifetimeSets: 0,
    heaviestBandOrdinal: -1,
    distinctExercisesPerformed: 0,
    passportEnabled: false,
    citiesVisited: 0,
    countriesVisited: 0,
    comebacks: 0,
    recoveryWeeksCompleted: 0,
    ...over,
  };
}

export function earnedRow(
  badgeId: string,
  over: Partial<EarnedBadgeRecord> = {},
): EarnedBadgeRecord {
  return {
    badgeId,
    earnedAt: '2026-10-01T12:00:00.000Z',
    localDate: '2026-10-01',
    sessionId: null,
    retroactive: false,
    seenAt: null,
    payload: {},
    ...over,
  };
}
