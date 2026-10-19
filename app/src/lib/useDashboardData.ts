/**
 * The dashboard's one shared read, used by both tab screens that grew out of the old Home:
 * Today (resume card, banners, week strip, next unlock) and Journey (lifetime, trails, logbook,
 * passport, muscle balance). Splitting the screen must not duplicate the load, so it lives here.
 *
 * §14.2 zero-session requirement: the progression board and Next Unlock must both render before
 * the user has ever generated a session. `ensureProgressionStatesInitialized` is called here
 * (idempotent store call, not new persistence logic) so a fresh install has starting-level
 * progression rows to show without waiting for a first generation.
 *
 * `loadDashboardData` only reads (plus the two idempotent `ensure*` initializers that were always
 * part of this load). Side effects that belong to one screen — the motivation-notification
 * reschedule and the opportunistic sync on Today — stay in that screen, driven from the fresh
 * data `reload` hands back.
 */
import { useCallback, useState } from 'react';
import {
  backfillBadges,
  badgesRepo,
  buildBadgeFacts,
  manualDayMarkersRepo,
  milestonesRepo,
  progressionStateRepo,
  sessionsRepo,
  signalsRepo,
  statsRepo,
  usersRepo,
  type Db,
} from '@roamfit/store';
import type { ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import { assessComeback, usableBands } from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from './localClock';
import { buildBadgeShelf, type BadgeShelf } from './badges';
import {
  buildCalendarDays,
  buildLifetimeCounters,
  buildMuscleBalanceRows,
  buildPassportSummary,
  buildProgressionBoard,
  earliestMonth,
  monthLabelForLocalDate,
  weekWindow,
  type CalendarDay,
  type FamilyBoardEntry,
  type LifetimeCounters,
  type MuscleBalanceRow,
  type PassportSummary,
} from './dashboard';

export interface DashboardData {
  pending: sessionsRepo.SessionRecord | null;
  stats: statsRepo.RolledUpStatsRecord;
  user: usersRepo.UserRecord;
  board: FamilyBoardEntry[];
  comebackTier: 'none' | 'week' | 'reset';
  recentTzChangeToday: boolean;
  /** "I'm in transit" was already tapped for today (drives the notification skip-today rule). */
  isTravelDayToday: boolean;
  passport: PassportSummary;
  calendarDays: CalendarDay[];
  /** The seven real days (Sun-Sat) of today's week, month boundaries included. */
  weekDays: CalendarDay[];
  calendarMonthLabel: string;
  /** Completed workouts per 'YYYY-MM' (months with none are absent) — the month picker's counts. */
  monthCounts: ReadonlyMap<string, number>;
  /** The first month with a session, hand-set marker or travel signal; null on a fresh install. */
  earliestMonth: string | null;
  todayLocalDate: string;
  muscleBalance: MuscleBalanceRow[];
  lifetimeCounters: LifetimeCounters;
  /** Track 38c - the badge shelf: Journey's card, Today's next-badge row and the Badges screen. */
  badges: BadgeShelf;
}

/** Track 38 — the startup badge backfill runs on the first dashboard load of each launch (the
 *  first screen to read the store), then never again until the next launch. Silent and idempotent;
 *  it cannot throw. */
const backfilledDbs = new WeakSet<Db>();
function ensureBadgesBackfilled(db: Db, library: ExerciseLibrary, families: FamilyLibrary): void {
  if (backfilledDbs.has(db)) return;
  backfilledDbs.add(db);
  backfillBadges(db, library, families, nowUtcInstant(), nowEngineClock().tzId);
}

export function loadDashboardData(
  db: Db,
  library: ExerciseLibrary,
  families: FamilyLibrary,
): DashboardData {
  const clock = nowEngineClock();
  progressionStateRepo.ensureProgressionStatesInitialized(
    db,
    families,
    library.exercises,
    clock.today,
  );
  ensureBadgesBackfilled(db, library, families);
  const user = usersRepo.ensureUser(db, nowUtcInstant());
  const stats = statsRepo.ensureStats(db, nowUtcInstant());
  const states: Record<ProgressionFamilyId, ProgressionState> =
    progressionStateRepo.getAllProgressionStates(db);
  const board = buildProgressionBoard(library, families, states, usableBands(user.bandSettings));
  const history = sessionsRepo.getHistoryForGeneration(db);
  const comebackTier = assessComeback(history, clock.today).tier;
  // §9.3 auto-suggest — consumes the tz_change signal Wave 3 already records (§8.3/users.ts's
  // `observeTzId`, called every generation). "Today" is a same-session heuristic: the most
  // recent tz_change event's local_date is today's. There's no persisted per-day dismissal
  // state (no schema for it), so a dismissal only lasts this screen visit — noted as a scope
  // simplification in STATUS-5-motivation.md rather than built out with new schema this wave.
  const tzChangeEvents = signalsRepo.getSignalEventsByType(db, 'tz_change');
  const latestTzChange = tzChangeEvents[tzChangeEvents.length - 1];
  const recentTzChangeToday = latestTzChange?.localDate === clock.today;

  const completedSessions = sessionsRepo.getCompletedSessionsForDashboard(db);
  const passport = buildPassportSummary(completedSessions);
  // §9.3 — every date "I'm in Transit" was tapped for, so the logbook can mark an untrained
  // travel day rather than show it as a plain empty square.
  const travelLocalDates = new Set(
    signalsRepo.getSignalEventsByType(db, 'travel_day').map((e) => e.localDate),
  );
  const manualDayMarkers = manualDayMarkersRepo.getManualDayMarkers(db);
  const calendarDays = buildCalendarDays(
    completedSessions,
    clock.today,
    travelLocalDates,
    manualDayMarkers,
  );
  // Same builder, wider window: the strip is the 7 real days of this week, so at a month edge it
  // reaches into the neighbouring month instead of borrowing the Logbook's month-only grid.
  const weekDays = buildCalendarDays(
    completedSessions,
    clock.today,
    travelLocalDates,
    manualDayMarkers,
    weekWindow(clock.today),
  );
  const monthCounts = sessionsRepo.countCompletedSessionsByMonth(db);
  const earliest = earliestMonth([
    ...monthCounts.keys(),
    ...manualDayMarkers.keys(),
    ...travelLocalDates,
  ]);
  const muscleBalance = buildMuscleBalanceRows(statsRepo.hardSetsByMuscle14d(db, clock.today));
  const milestones = milestonesRepo.getAllMilestones(db);
  const lifetimeCounters = buildLifetimeCounters(
    stats.lifetimeSessionCount,
    statsRepo.lifetimeSets(db),
    passport,
    milestones.filter((m) => m.type === 'level_up').length,
    milestones.filter((m) => m.type === 'best_set_pr').length,
  );
  const badges = buildBadgeShelf(
    badgesRepo.getEarnedBadges(db),
    buildBadgeFacts(db, library, families),
  );

  return {
    pending: sessionsRepo.getPendingSession(db),
    stats,
    user,
    board,
    comebackTier,
    recentTzChangeToday,
    isTravelDayToday: travelLocalDates.has(clock.today),
    passport,
    calendarDays,
    weekDays,
    calendarMonthLabel: monthLabelForLocalDate(clock.today),
    monthCounts,
    earliestMonth: earliest,
    todayLocalDate: clock.today,
    muscleBalance,
    lifetimeCounters,
    badges,
  };
}

/** `data` is `undefined` until the first `reload()`. Screens call `reload` from their own
 *  `useFocusEffect` (so each keeps its own focus-time extras) and after every mutation. */
export function useDashboardData(): {
  data: DashboardData | undefined;
  reload: () => DashboardData;
} {
  const { db, library, families } = useStore();
  const [data, setData] = useState<DashboardData | undefined>(undefined);
  const reload = useCallback(() => {
    const fresh = loadDashboardData(db, library, families);
    setData(fresh);
    return fresh;
  }, [db, library, families]);
  return { data, reload };
}
