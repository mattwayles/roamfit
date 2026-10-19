/**
 * Track 38 — gathers the `BadgeFacts` snapshot the engine's badge evaluator reads. Pure read of
 * local SQLite; nothing here decides whether a badge is earned (that is `evaluateBadges`).
 *
 * Everything is lifetime, over completed sessions only; set-level facts count main-section,
 * completed sets only (warm-up and cool-down are prep, not training). Calendar math uses
 * `local_date` (invariant 6): distinct weeks via `isoWeekKey(local_date)`, comebacks via
 * `daysBetween` on local dates. Time of day is the session's own start instant converted through
 * its own `tz_id`, never UTC hours and never the device's current zone.
 *
 * Read all-at-once rather than incrementally: SQLite is local and the history is a few thousand
 * rows at most. Measure before optimising.
 */
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import { BAND_ORDER, daysBetween, isMaxLevel, levelOrdinal } from '@roamfit/engine';
import type { BadgeFacts } from '@roamfit/engine';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { schema } from './db';
import { getAllMilestones } from './repositories/milestones';
import { getAllProgressionStates } from './repositories/progressionState';
import { isoWeekKey } from './repositories/stats';
import { getUser } from './repositories/users';

const USER_ID = 'local';
const COMEBACK_GAP_DAYS = 14;
const CLEAN_SWEEP_MIN_SETS = 6;
const EARLY_BEFORE_HOUR = 7;
const LATE_FROM_HOUR = 21;

/** Hour of day (0-23) at `utcInstant` in zone `tzId`. Null when either is unusable. */
export function localHourOf(utcInstant: string, tzId: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(utcInstant));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    return Number.isFinite(hour) ? hour % 24 : null;
  } catch {
    return null;
  }
}

/** One Passport place, keyed the way the app labels it ("Bend, OR, USA"): city, a region only
 *  when it is already an abbreviation, and the country code (else the country name). The app's
 *  `formatPlace` is app-only, so this mirrors its partition of sessions into places. */
function placeKey(s: {
  city: string | null;
  region: string | null;
  countryCode: string | null;
  country: string | null;
}): string | null {
  if (!s.city) return null;
  const region = s.region?.trim();
  const code = s.countryCode?.trim().toUpperCase();
  return [
    s.city,
    region && region.length <= 3 ? region.toUpperCase() : '',
    code || s.country?.trim() || '',
  ].join('|');
}

export function buildBadgeFacts(
  db: Db,
  library: ExerciseLibrary,
  families: FamilyLibrary,
): BadgeFacts {
  const sessions = db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, USER_ID), eq(schema.sessions.status, 'completed')))
    .all();

  // Main-section work of completed sessions, one row per set log (entries with no logs still
  // produce a row with a null set so planned-set counts see them).
  const rows = db
    .select({
      sessionId: schema.sessionEntries.sessionId,
      entryId: schema.sessionEntries.id,
      entrySets: schema.sessionEntries.sets,
      entryBand: schema.sessionEntries.band,
      exerciseId: schema.sessionEntries.exerciseId,
      setStatus: schema.setLogs.status,
      repsActual: schema.setLogs.repsActual,
      secondsActual: schema.setLogs.secondsActual,
      bandActual: schema.setLogs.bandActual,
    })
    .from(schema.sessionEntries)
    .innerJoin(schema.sessions, eq(schema.sessions.id, schema.sessionEntries.sessionId))
    .leftJoin(schema.setLogs, eq(schema.setLogs.entryId, schema.sessionEntries.id))
    .where(
      and(
        eq(schema.sessions.userId, USER_ID),
        eq(schema.sessions.status, 'completed'),
        eq(schema.sessionEntries.section, 'main'),
      ),
    )
    .all();

  // `removed_at_approval` entries were never part of the workout.
  const removed = new Set(
    db
      .select({ id: schema.sessionEntries.id })
      .from(schema.sessionEntries)
      .where(eq(schema.sessionEntries.entryStatus, 'removed_at_approval'))
      .all()
      .map((r) => r.id),
  );

  const metricOf = new Map(library.exercises.map((e) => [e.id, e.metric]));
  const plannedBySession = new Map<string, number>();
  const completedBySession = new Map<string, number>();
  const seenEntries = new Set<string>();
  const exercises = new Set<string>();
  let lifetimeReps = 0;
  let lifetimeHoldSeconds = 0;
  let lifetimeSets = 0;
  let heaviestBandOrdinal = -1;

  for (const r of rows) {
    if (removed.has(r.entryId)) continue;
    if (!seenEntries.has(r.entryId)) {
      seenEntries.add(r.entryId);
      plannedBySession.set(r.sessionId, (plannedBySession.get(r.sessionId) ?? 0) + r.entrySets);
    }
    if (r.setStatus !== 'completed') continue;
    lifetimeSets += 1;
    completedBySession.set(r.sessionId, (completedBySession.get(r.sessionId) ?? 0) + 1);
    exercises.add(r.exerciseId);
    if (metricOf.get(r.exerciseId) === 'time') lifetimeHoldSeconds += r.secondsActual ?? 0;
    else lifetimeReps += r.repsActual ?? 0;
    const band = r.bandActual ?? r.entryBand;
    const ordinal = band ? BAND_ORDER.indexOf(band as (typeof BAND_ORDER)[number]) : -1;
    if (ordinal > heaviestBandOrdinal) heaviestBandOrdinal = ordinal;
  }

  let totalMinutes = 0;
  let longestSessionMinutes = 0;
  let hardSessionsCompleted = 0;
  let cleanSweepSessions = 0;
  let earlySessions = 0;
  let lateSessions = 0;
  let recoveryWeeksCompleted = 0;
  const weeks = new Set<string>();
  const focuses = new Set<string>();
  const places = new Set<string>();
  const countries = new Set<string>();

  for (const s of sessions) {
    const minutes = Math.round(s.actualMinutes ?? s.estimatedMinutes);
    totalMinutes += minutes;
    longestSessionMinutes = Math.max(longestSessionMinutes, minutes);
    if (s.difficulty === 'hard') hardSessionsCompleted += 1;
    const planned = plannedBySession.get(s.id) ?? 0;
    if (planned >= CLEAN_SWEEP_MIN_SETS && (completedBySession.get(s.id) ?? 0) >= planned) {
      cleanSweepSessions += 1;
    }
    const hour = localHourOf(s.startedAt ?? s.utcInstant, s.tzId);
    if (hour !== null) {
      if (hour < EARLY_BEFORE_HOUR) earlySessions += 1;
      if (hour >= LATE_FROM_HOUR) lateSessions += 1;
    }
    if (s.recoveryWeekManual) recoveryWeeksCompleted += 1;
    weeks.add(isoWeekKey(s.localDate));
    focuses.add(s.focus);
    const place = placeKey(s);
    if (place) places.add(place);
    if (s.country) countries.add(s.country);
  }

  // Comebacks: a session 14+ days after the one before it. The first session never counts.
  const dates = sessions.map((s) => s.localDate).sort();
  let comebacks = 0;
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) >= COMEBACK_GAP_DAYS) comebacks += 1;
  }

  // Milestones are written inside the completion transaction, so they already include the
  // session being completed.
  const milestones = getAllMilestones(db);
  const prsBySession = new Map<string, number>();
  let bestSetPrsTotal = 0;
  let levelUpsTotal = 0;
  for (const m of milestones) {
    if (m.type === 'level_up') levelUpsTotal += 1;
    if (m.type === 'best_set_pr') {
      bestSetPrsTotal += 1;
      if (m.sessionId) prsBySession.set(m.sessionId, (prsBySession.get(m.sessionId) ?? 0) + 1);
    }
  }

  const states = getAllProgressionStates(db);
  let highestLevelOrdinal = 0;
  let familiesAtOrAbove3 = 0;
  const familiesAtTop: string[] = [];
  for (const family of families.families) {
    const state = states[family.id];
    if (!state) continue;
    const n = levelOrdinal(family, state.levelId).n;
    if (n > highestLevelOrdinal) highestLevelOrdinal = n;
    if (n >= 3) familiesAtOrAbove3 += 1;
    if (isMaxLevel(family, state.levelId)) familiesAtTop.push(family.id);
  }

  return {
    sessionsCompleted: sessions.length,
    totalMinutes,
    distinctActiveWeeks: weeks.size,
    focusesTrained: [...focuses],
    hardSessionsCompleted,
    cleanSweepSessions,
    longestSessionMinutes,
    earlySessions,
    lateSessions,
    levelUpsTotal,
    highestLevelOrdinal,
    familiesAtTop,
    familyCount: families.families.length,
    familiesAtOrAbove3,
    bestSetPrsTotal,
    maxPrsInOneSession: Math.max(0, ...prsBySession.values()),
    lifetimeReps,
    lifetimeHoldSeconds,
    lifetimeSets,
    heaviestBandOrdinal,
    distinctExercisesPerformed: exercises.size,
    passportEnabled: getUser(db)?.passportEnabled ?? false,
    citiesVisited: places.size,
    countriesVisited: countries.size,
    comebacks,
    recoveryWeeksCompleted,
  };
}
